import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { AsistenciaService } from './asistencia.service';
import { MarcarDto } from './dto/marcar.dto';
import { CorregirJornadaDto, CrearJornadaDto, EliminarJornadaDto, FiltrosAsistenciaDto } from './dto/jornada.dto';

@ApiTags('Empleados')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('asistencia')
export class AsistenciaController {
  constructor(private readonly asistencia: AsistenciaService) {}

  /** Sin @RequierePermiso: cualquier sesión del negocio (la caja) deja marcar; el PIN identifica al empleado (spec §4). */
  @Post('marcar')
  @HttpCode(200)
  marcar(@Body() dto: MarcarDto) {
    return this.asistencia.marcar(dto.pin, dto.sucursalId);
  }

  @Get('jornadas')
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.VER)
  listar(@Query() f: FiltrosAsistenciaDto) {
    return this.asistencia.listar(f);
  }

  @Post('jornadas')
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.EDITAR)
  crear(@Body() dto: CrearJornadaDto) {
    return this.asistencia.crearManual(dto);
  }

  @Patch('jornadas/:id')
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.EDITAR)
  corregir(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CorregirJornadaDto) {
    return this.asistencia.corregir(id, dto);
  }

  @Delete('jornadas/:id')
  @HttpCode(204)
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.EDITAR)
  eliminar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EliminarJornadaDto) {
    return this.asistencia.eliminar(id, dto.motivo);
  }
}
