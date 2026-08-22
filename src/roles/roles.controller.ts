import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
import { ActualizarPermisosRolDto } from './dto/actualizar-permisos-rol.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

@ApiTags('Roles')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('catalogo')
  @RequierePermiso(ModuloPermiso.ROLES, AccionPermiso.VER)
  catalogo() {
    return this.rolesService.catalogo();
  }

  @Get()
  @RequierePermiso(ModuloPermiso.ROLES, AccionPermiso.VER)
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.ROLES, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequierePermiso(ModuloPermiso.ROLES, AccionPermiso.CREAR)
  create(@Body() dto: CreateRolDto) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.ROLES, AccionPermiso.EDITAR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRolDto) {
    return this.rolesService.update(id, dto);
  }

  @Patch(':id/permisos')
  @RequierePermiso(ModuloPermiso.ROLES, AccionPermiso.EDITAR)
  actualizarPermisos(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarPermisosRolDto,
  ) {
    return this.rolesService.actualizarPermisos(id, dto.permisoIds);
  }

  @Delete(':id')
  @RequierePermiso(ModuloPermiso.ROLES, AccionPermiso.ELIMINAR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.remove(id);
  }
}
