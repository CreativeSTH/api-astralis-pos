import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { EMAIL_VERIFICADO_CAMPO_KEY } from '../decorators/requiere-email-verificado.decorator';

@Injectable()
export class EmailVerificadoGuard implements CanActivate {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuariosRepository: Repository<Usuario>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<boolean | string>(EMAIL_VERIFICADO_CAMPO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (metadata === undefined) return true; // endpoint sin el decorator — no aplica

    const request = context.switchToHttp().getRequest();
    const exigeVerificacion = typeof metadata === 'string' ? Boolean(request.body?.[metadata]) : metadata;
    if (!exigeVerificacion) return true;

    // Rechequea contra la DB, nunca confía en el emailVerificado del JWT —
    // el usuario pudo verificar el correo después de loguearse.
    const usuario = await this.usuariosRepository.findOne({ where: { id: request.user.sub } });
    if (!usuario?.emailVerificado) {
      throw new ForbiddenException('Confirmá tu correo antes de hacer esto');
    }
    return true;
  }
}
