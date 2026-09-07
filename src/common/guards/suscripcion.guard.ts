import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtUserPayload } from '../decorators/current-user.decorator';
import { SuscripcionesService } from '../../suscripciones/suscripciones.service';

/**
 * Rutas alcanzables aunque el negocio esté VENCIDA — sin esto, un negocio
 * bloqueado no tendría ninguna forma de reactivarse ni de cerrar sesión.
 *
 * `request.route.path` incluye el prefijo global `api` (`app.setGlobalPrefix('api')`
 * en main.ts) — confirmado en vivo levantando el servidor, donde
 * `request.route.path` para `GET /api/suscripcion/mi-estado` resultó ser
 * `/api/suscripcion/mi-estado`, no `/suscripcion/mi-estado` como se podría
 * asumir. Sin el prefijo acá, esta whitelist nunca hace match con nada y
 * un negocio VENCIDA queda sin forma de reactivarse — bug real detectado
 * y corregido antes de continuar.
 */
const RUTAS_PERMITIDAS_BLOQUEADO = new Set([
  'GET /api/suscripcion/mi-estado',
  'POST /api/suscripcion/reactivar',
  'GET /api/suscripcion/medio-pago',
  'DELETE /api/suscripcion/medio-pago',
  'POST /api/auth/logout',
  // El selector de plan de la pantalla de reactivación (ver SelectorPlanPago) necesita
  // listar los paquetes disponibles incluso con el negocio bloqueado — sin esto, un negocio
  // VENCIDA no puede ver ni elegir otro plan al pagar, solo reactivar a ciegas el mismo de antes.
  'GET /api/paquetes/disponibles',
]);

@Injectable()
export class SuscripcionGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly suscripciones: SuscripcionesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtUserPayload | undefined;
    // Sin user (no debería pasar, JwtAuthGuard ya corrió) o tier SISTEMA (no tiene Suscripcion): no aplica.
    if (!user || user.rolTier === 'SISTEMA' || !user.negocioId) return true;

    const acceso = await this.suscripciones.estadoAcceso(user.negocioId);
    if (acceso === 'OK') return true;

    const metodo = request.method as string;
    const ruta = request.route?.path as string | undefined;
    if (ruta && RUTAS_PERMITIDAS_BLOQUEADO.has(`${metodo} ${ruta}`)) return true;

    // Modo de gracia (ver SuscripcionesService.estadoAcceso): los GET pasan siempre, solo se
    // bloquea escribir algo nuevo. El `code` es lo que el interceptor del frontend usa para no
    // navegar a la pantalla de bloqueo total cuando esto es apenas modo solo-lectura.
    if (acceso === 'GRACIA' && metodo === 'GET') return true;

    throw new HttpException(
      {
        message:
          acceso === 'GRACIA'
            ? 'Tu suscripción venció — en modo de solo lectura no podés hacer esta acción. Reactivala para seguir usando el sistema.'
            : 'La suscripción de tu negocio venció — reactivala para seguir usando el sistema',
        code: acceso === 'GRACIA' ? 'SOLO_LECTURA' : 'BLOQUEADO',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
