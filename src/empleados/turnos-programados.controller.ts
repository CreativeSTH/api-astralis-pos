import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { TurnosProgramadosService } from './turnos-programados.service';
import {
  CopiarSemanaDto,
  CreateTurnoProgramadoDto,
  FiltrosTurnosDto,
  UpdateTurnoProgramadoDto,
} from './dto/turno-programado.dto';

@ApiTags('Empleados')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('turnos-programados')
export class TurnosProgramadosController {
  constructor(private readonly turnos: TurnosProgramadosService) {}

  @Get()
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.VER)
  listar(@Query() f: FiltrosTurnosDto) {
    return this.turnos.listar(f.desde, f.hasta, f.sucursalId);
  }

  @Post()
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.CREAR)
  create(@Body() dto: CreateTurnoProgramadoDto) {
    return this.turnos.create(dto);
  }

  @Post('copiar-semana')
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.CREAR)
  copiarSemana(@Body() dto: CopiarSemanaDto) {
    return this.turnos.copiarSemana(dto.lunesDestino, dto.sucursalId);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.EDITAR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTurnoProgramadoDto) {
    return this.turnos.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.ELIMINAR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.turnos.remove(id);
  }
}
