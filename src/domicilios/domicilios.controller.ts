import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DomiciliosService } from './domicilios.service';
import { MarcarEnCaminoDto } from './dto/marcar-en-camino.dto';
import { CancelarDomicilioDto } from './dto/cancelar-domicilio.dto';
import { EstadoDomicilio } from '../common/enums/estado-domicilio.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

/** Un domicilio se crea junto con su venta (POST /ventas con `domicilio`) — este controller solo lee y avanza estados. */
@ApiTags('Domicilios')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('domicilios')
export class DomiciliosController {
  constructor(private readonly domiciliosService: DomiciliosService) {}

  @Get()
  @RequierePermiso(ModuloPermiso.DOMICILIOS, AccionPermiso.VER)
  findAll(
    @Query('estado') estado?: EstadoDomicilio,
    @Query('sucursalId') sucursalId?: string,
  ) {
    return this.domiciliosService.findAll(estado, sucursalId);
  }

  @Patch(':id/en-camino')
  @RequierePermiso(ModuloPermiso.DOMICILIOS, AccionPermiso.EDITAR)
  marcarEnCamino(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarcarEnCaminoDto,
  ) {
    return this.domiciliosService.marcarEnCamino(id, dto.domiciliarioNombre);
  }

  @Patch(':id/entregado')
  @RequierePermiso(ModuloPermiso.DOMICILIOS, AccionPermiso.EDITAR)
  marcarEntregado(@Param('id', ParseUUIDPipe) id: string) {
    return this.domiciliosService.marcarEntregado(id);
  }

  @Patch(':id/cancelar')
  @RequierePermiso(ModuloPermiso.DOMICILIOS, AccionPermiso.EDITAR)
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelarDomicilioDto,
  ) {
    return this.domiciliosService.cancelar(id, dto.motivo);
  }
}
