import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesService } from './roles.service';
import { PermisosService } from './permisos.service';
import { RolesController } from './roles.controller';
import { Rol } from './entities/rol.entity';
import { Permiso } from './entities/permiso.entity';

/**
 * Global: PermissionsGuard (APP_GUARD) y cada controller que hace
 * @UseGuards(..., PermissionsGuard) localmente necesitan poder inyectar
 * PermisosService sin que cada módulo de feature tenga que importar RolesModule.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Rol, Permiso])],
  controllers: [RolesController],
  providers: [RolesService, PermisosService],
  exports: [RolesService, PermisosService],
})
export class RolesModule {}
