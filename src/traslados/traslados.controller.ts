import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { TrasladosService } from './traslados.service';
import { CrearTrasladoDto } from './dto/crear-traslado.dto';
import { RecibirTrasladoDto } from './dto/recibir-traslado.dto';
import { FiltrosTrasladosDto } from './dto/filtros-traslados.dto';

@ApiTags('Traslados')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('traslados')
export class TrasladosController {
  constructor(private readonly traslados: TrasladosService) {}

  @Get()
  @RequierePermiso(ModuloPermiso.TRASLADOS, AccionPermiso.VER)
  listar(@Query() filtros: FiltrosTrasladosDto) {
    return this.traslados.listar(filtros);
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.TRASLADOS, AccionPermiso.VER)
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.traslados.detalle(id);
  }

  @Post()
  @RequierePermiso(ModuloPermiso.TRASLADOS, AccionPermiso.CREAR)
  enviar(@Body() dto: CrearTrasladoDto) {
    return this.traslados.enviar(dto);
  }

  /** EDITAR = recibir (spec 2026-10-04 §7). */
  @Post(':id/recibir')
  @RequierePermiso(ModuloPermiso.TRASLADOS, AccionPermiso.EDITAR)
  recibir(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecibirTrasladoDto) {
    return this.traslados.recibir(id, dto);
  }

  /** ELIMINAR = cancelar. */
  @Post(':id/cancelar')
  @RequierePermiso(ModuloPermiso.TRASLADOS, AccionPermiso.ELIMINAR)
  cancelar(@Param('id', ParseUUIDPipe) id: string) {
    return this.traslados.cancelar(id);
  }
}
