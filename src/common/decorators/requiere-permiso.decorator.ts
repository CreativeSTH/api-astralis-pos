import { SetMetadata } from '@nestjs/common';
import { ModuloPermiso } from '../enums/modulo-permiso.enum';
import { AccionPermiso } from '../enums/accion-permiso.enum';

export const PERMISO_KEY = 'permiso';

export interface PermisoRequerido {
  modulo: ModuloPermiso;
  accion: AccionPermiso;
}

export const RequierePermiso = (modulo: ModuloPermiso, accion: AccionPermiso) =>
  SetMetadata(PERMISO_KEY, { modulo, accion } as PermisoRequerido);
