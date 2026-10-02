import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { DevolucionesService } from './devoluciones.service';
import { CrearDevolucionDto } from './dto/crear-devolucion.dto';
import { FiltrosDevolucionesDto } from './dto/filtros-devoluciones.dto';
import { ComprobantesService } from '../ventas/comprobantes.service';

@ApiTags('Devoluciones')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class DevolucionesController {
  constructor(
    private readonly devoluciones: DevolucionesService,
    private readonly comprobantes: ComprobantesService,
  ) {}

  @Get('ventas/:id/devolvible')
  @RequierePermiso(ModuloPermiso.DEVOLUCIONES, AccionPermiso.VER)
  @ApiOperation({ summary: 'Qué se puede devolver de una venta, con qué reembolsos y si hay un bloqueo' })
  devolvible(@Param('id', ParseUUIDPipe) id: string) {
    return this.devoluciones.devolvible(id);
  }

  /** VER basta para llamar: sin DEVOLUCIONES:CREAR el servicio exige el PIN de quien lo tenga (como cancelar venta). */
  @Post('devoluciones')
  @RequierePermiso(ModuloPermiso.DEVOLUCIONES, AccionPermiso.VER)
  crear(@Body() dto: CrearDevolucionDto) {
    return this.devoluciones.crear(dto);
  }

  @Get('devoluciones')
  @RequierePermiso(ModuloPermiso.DEVOLUCIONES, AccionPermiso.VER)
  listar(@Query() filtros: FiltrosDevolucionesDto) {
    return this.devoluciones.listar(filtros);
  }

  @Get('devoluciones/:id')
  @RequierePermiso(ModuloPermiso.DEVOLUCIONES, AccionPermiso.VER)
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.devoluciones.detalle(id);
  }

  /** Mismo contenido para pos-agent y para el respaldo de impresión del navegador. */
  @Get('devoluciones/:id/comprobante')
  @RequierePermiso(ModuloPermiso.DEVOLUCIONES, AccionPermiso.VER)
  comprobante(@Param('id', ParseUUIDPipe) id: string) {
    return this.comprobantes.obtenerContenidoDevolucion(id);
  }
}
