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
import { CreateVentaDto } from './dto/create-venta.dto';
import { CancelarVentaDto } from './dto/cancelar-venta.dto';
import { AbonarCuotaDto } from './dto/abonar-cuota.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuario } from '../common/enums/rol-usuario.enum';

@ApiTags('Ventas')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @ApiOperation({
    summary:
      'Crear venta CONTADO o CREDITO según tipoVenta (requiere turno de caja abierto)',
  })
  create(@Body() dto: CreateVentaDto) {
    return this.ventasService.crear(dto);
  }

  @Get()
  findAll() {
    return this.ventasService.findAll();
  }

  @Get('cliente/:clienteId')
  findPorCliente(@Param('clienteId', ParseUUIDPipe) clienteId: string) {
    return this.ventasService.findPorCliente(clienteId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ventasService.findOne(id);
  }

  @Patch(':id/abonar-cuota')
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
      'Cancela una venta (revierte stock y, si aplica, caja). Requiere ser ADMIN_NEGOCIO o incluir pinAutorizacion de uno.',
  })
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelarVentaDto,
  ) {
    return this.ventasService.cancelar(id, dto);
  }

  @Post('calcular-moras')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  @ApiOperation({ summary: 'Recalcula la mora de todas las cuotas vencidas' })
  calcularMoras() {
    return this.ventasService.calcularMoras();
  }

  @Post('verificar-vencimientos')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  @ApiOperation({
    summary:
      'Actualiza el estado de ventas a crédito según sus cuotas vencidas',
  })
  verificarVencimientos() {
    return this.ventasService.verificarVencimientos();
  }
}
