import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { VentasService } from './ventas.service';
import { ContingenciaService } from '../facturacion-electronica/contingencia.service';
import { SincronizarSinConexionDto } from './dto/sincronizar-sin-conexion.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/decorators/current-user.decorator';

class ReservarBloqueDto {
  @IsString()
  @IsNotEmpty()
  terminalId: string;
}

/**
 * Fase 6b: lo que la caja necesita para vender sin conexión y para sincronizar al volver. Con
 * `VENTAS:CREAR`, no con permisos de facturación: quien lo usa es el cajero.
 */
@ApiTags('Ventas — sin conexión')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ventas/sin-conexion')
export class VentasSinConexionController {
  constructor(
    private readonly ventasService: VentasService,
    private readonly contingencia: ContingenciaService,
  ) {}

  @Get('datos')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.CREAR)
  datos(@CurrentUser() u: JwtUserPayload) {
    return this.contingencia.datosSinConexion(u.negocioId!);
  }

  @Post('reservas')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.CREAR)
  reservar(@CurrentUser() u: JwtUserPayload, @Body() dto: ReservarBloqueDto) {
    return this.contingencia.reservarBloque(u.negocioId!, dto.terminalId);
  }

  @Post('sincronizar')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.CREAR)
  sincronizar(@Body() dto: SincronizarSinConexionDto) {
    return this.ventasService.sincronizarSinConexion(dto);
  }
}
