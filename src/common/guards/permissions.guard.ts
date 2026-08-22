import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISO_KEY,
  PermisoRequerido,
} from '../decorators/requiere-permiso.decorator';
import { JwtUserPayload } from '../decorators/current-user.decorator';
import { PermisosService } from '../../roles/permisos.service';

@Injectable()
export class PermissionsGuard {
  constructor(
    private readonly reflector: Reflector,
    private readonly permisos: PermisosService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requerido = this.reflector.getAllAndOverride<PermisoRequerido>(
      PERMISO_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requerido) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtUserPayload | undefined;
    const autorizado = await this.permisos.rolTienePermiso(
      user?.rolId,
      requerido.modulo,
      requerido.accion,
    );
    if (!autorizado) {
      throw new ForbiddenException(
        'No tienes permisos para realizar esta acción',
      );
    }
    return true;
  }
}
