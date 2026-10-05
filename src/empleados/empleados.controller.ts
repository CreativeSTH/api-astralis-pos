import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { EmpleadosService } from './empleados.service';
import { CreateEmpleadoDto, UpdateEmpleadoDto } from './dto/create-empleado.dto';
import { CambiarPinDto } from './dto/cambiar-pin.dto';

@ApiTags('Empleados')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('empleados')
export class EmpleadosController {
  constructor(private readonly empleados: EmpleadosService) {}

  @Get()
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.VER)
  findAll() {
    return this.empleados.findAll();
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.empleados.findOne(id);
  }

  @Post()
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.CREAR)
  create(@Body() dto: CreateEmpleadoDto) {
    return this.empleados.create(dto);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.EDITAR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmpleadoDto) {
    return this.empleados.update(id, dto);
  }

  @Patch(':id/pin')
  @HttpCode(204)
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.EDITAR)
  cambiarPin(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CambiarPinDto) {
    return this.empleados.cambiarPin(id, dto.pin);
  }

  /** Desactiva (borrado suave): sus jornadas siguen en los reportes. */
  @Delete(':id')
  @HttpCode(204)
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.ELIMINAR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.empleados.remove(id);
  }
}
