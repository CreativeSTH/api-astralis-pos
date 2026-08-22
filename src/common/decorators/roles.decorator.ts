import { SetMetadata } from '@nestjs/common';
import { RolUsuario } from '../enums/rol-usuario.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);
