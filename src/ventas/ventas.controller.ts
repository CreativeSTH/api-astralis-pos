import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VentasService } from './ventas.service';
import { ComprobantesService } from './comprobantes.service';
import { CreateVentaDto } from './dto/create-venta.dto';
import { CancelarVentaDto } from './dto/cancelar-venta.dto';
import { AbonarCuotaDto } from './dto/abonar-cuota.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

@ApiTags('Ventas')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ventas')
export class VentasController {
  constructor(
    private readonly ventasService: VentasService,
    private readonly comprobantesService: ComprobantesService,
  ) {}

  @Post()
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.CREAR)
  @ApiOperation({
    summary:
      'Crear venta CONTADO o CREDITO según tipoVenta (requiere turno de caja abierto)',
  })
  create(@Body() dto: CreateVentaDto) {
    return this.ventasService.crear(dto);
  }

  @Get()
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.VER)
  findAll() {
    return this.ventasService.findAll();
  }

  @Get('cliente/:clienteId')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.VER)
  findPorCliente(@Param('clienteId', ParseUUIDPipe) clienteId: string) {
    return this.ventasService.findPorCliente(clienteId);
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ventasService.findOne(id);
  }

  @Get(':id/comprobante')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.VER)
  @ApiOperation({
    summary: 'Contenido resuelto para imprimir el recibo/factura de una venta (plantilla + datos, listo para el print-agent)',
  })
  obtenerComprobante(@Param('id', ParseUUIDPipe) id: string) {
    return this.comprobantesService.obtenerContenido(id);
  }

  @Patch(':id/abonar-cuota')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.EDITAR)
  @ApiOperation({
    summary: 'Registrar un abono a una cuota de venta a crédito',
  })
  abonarCuota(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AbonarCuotaDto,
  ) {
    return this.ventasService.abonarCuota(id, dto);
  }

  @Post(':id/cancelar')
  @ApiOperation({
    summary:
      'Cancela una venta (revierte stock y, si aplica, caja). Requiere VENTAS:ELIMINAR o incluir pinAutorizacion de alguien que lo tenga.',
  })
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelarVentaDto,
  ) {
    return this.ventasService.cancelar(id, dto);
  }

  @Post('calcular-moras')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.ELIMINAR)
  @ApiOperation({ summary: 'Recalcula la mora de todas las cuotas vencidas' })
  calcularMoras() {
    return this.ventasService.calcularMoras();
  }

  @Post('verificar-vencimientos')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.ELIMINAR)
  @ApiOperation({
    summary:
      'Actualiza el estado de ventas a crédito según sus cuotas vencidas',
  })
  verificarVencimientos() {
    return this.ventasService.verificarVencimientos();
  }
}
