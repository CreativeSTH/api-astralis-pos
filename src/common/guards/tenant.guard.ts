import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtUserPayload } from '../decorators/current-user.decorator';

/**
 * Copia negocioId/sucursalId/rol del JWT ya validado al contexto CLS de la
 * request, para que TenantBaseService pueda aislar cada query sin que cada
 * servicio tenga que recibirlos explícitamente.
 */
@Injectable()
export class TenantGuard {
  constructor(
    private readonly cls: ClsService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtUserPayload | undefined;
    if (user) {
      this.cls.set('negocioId', user.negocioId);
      this.cls.set('sucursalId', user.sucursalId);
      this.cls.set('usuarioId', user.sub);
      this.cls.set('rol', user.rol);
    }
    return true;
  }
}
