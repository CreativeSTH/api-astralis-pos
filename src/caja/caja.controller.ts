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
import { CajaService } from './caja.service';
import { AbrirTurnoDto } from './dto/abrir-turno.dto';
import { CerrarTurnoDto } from './dto/cerrar-turno.dto';
import { RegistrarMovimientoDto } from './dto/registrar-movimiento.dto';
import { PagarDescuadreDto } from './dto/pagar-descuadre.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Caja')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('caja')
export class CajaController {
  constructor(private readonly cajaService: CajaService) {}

  @Post('turnos/abrir')
  @ApiOperation({ summary: 'Abrir turno de caja con fondo inicial' })
  abrirTurno(@Body() dto: AbrirTurnoDto) {
    return this.cajaService.abrirTurno(dto);
  }

  @Post('turnos/:id/cerrar')
  @ApiOperation({ summary: 'Cerrar turno de caja con arqueo' })
  cerrarTurno(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CerrarTurnoDto,
  ) {
    return this.cajaService.cerrarTurno(id, dto);
  }

  @Get('turnos')
  findAll() {
    return this.cajaService.findAll();
  }

  @Get('turnos/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cajaService.findOne(id);
  }

  @Get('turnos/:id/movimientos')
  listarMovimientos(@Param('id', ParseUUIDPipe) id: string) {
    return this.cajaService.listarMovimientos(id);
  }

  @Get('turnos/:id/resumen')
  @ApiOperation({
    summary:
      'Desglose de efectivo vs. pagos digitales antes de cerrar el turno',
  })
  resumen(@Param('id', ParseUUIDPipe) id: string) {
    return this.cajaService.resumen(id);
  }

  @Patch('turnos/:id/pagar-descuadre')
  @ApiOperation({
    summary:
      'Marca el descuadre de un turno ya cerrado como pagado/resuelto',
  })
  pagarDescuadre(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PagarDescuadreDto,
  ) {
    return this.cajaService.pagarDescuadre(id, dto);
  }

  @Post('movimientos')
  @ApiOperation({
    summary: 'Registrar ingreso, egreso o retiro manual de efectivo',
  })
  registrarMovimiento(@Body() dto: RegistrarMovimientoDto) {
    return this.cajaService.registrarMovimiento(dto);
  }
}
