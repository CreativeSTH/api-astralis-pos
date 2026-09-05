import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuscripcionesService } from './suscripciones.service';
import { ReactivarSuscripcionDto } from './dto/reactivar-suscripcion.dto';
import { CancelarSuscripcionDto } from './dto/cancelar-suscripcion.dto';
import { CambiarPaquetePruebaDto } from './dto/cambiar-paquete-prueba.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { EmailVerificadoGuard } from '../common/guards/email-verificado.guard';
import { Public } from '../common/decorators/public.decorator';
import { RequiereEmailVerificado } from '../common/decorators/requiere-email-verificado.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Suscripción')
@Controller('suscripcion')
export class SuscripcionesController {
  constructor(private readonly suscripcionesService: SuscripcionesService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('mi-estado')
  @ApiOperation({ summary: 'Estado de la suscripción del negocio autenticado — alcanzable aunque esté VENCIDA' })
  miEstado(@CurrentUser() usuario: JwtUserPayload) {
    return this.suscripcionesService.miEstado(usuario.negocioId!);
  }

  @UseGuards(JwtAuthGuard, EmailVerificadoGuard)
  @RequiereEmailVerificado('guardarTarjeta')
  @ApiBearerAuth('JWT-auth')
  @Post('reactivar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactiva (o cambia de plan) con un cobro único — alcanzable aunque esté VENCIDA' })
  reactivar(@CurrentUser() usuario: JwtUserPayload, @Body() dto: ReactivarSuscripcionDto) {
    return this.suscripcionesService.iniciarReactivacion(usuario.negocioId!, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('cancelar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancela la suscripción — sigue con acceso hasta fechaFin, ya pagado' })
  cancelar(@CurrentUser() usuario: JwtUserPayload, @Body() dto: CancelarSuscripcionDto) {
    return this.suscripcionesService.cancelar(usuario.negocioId!, dto.motivo);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('revertir-cancelacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revierte una cancelación mientras el período pagado no venció — gratis' })
  revertirCancelacion(@CurrentUser() usuario: JwtUserPayload) {
    return this.suscripcionesService.revertirCancelacion(usuario.negocioId!);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Patch('paquete-prueba')
  @ApiOperation({ summary: 'Cambia de plan sin pagar, solo mientras dure la prueba gratis' })
  cambiarPaqueteEnPrueba(@CurrentUser() usuario: JwtUserPayload, @Body() dto: CambiarPaquetePruebaDto) {
    return this.suscripcionesService.cambiarPaqueteEnPrueba(usuario.negocioId!, dto.paqueteId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('medio-pago')
  @ApiOperation({ summary: 'Estado del medio de pago guardado para débito automático' })
  async medioPago(@CurrentUser() usuario: JwtUserPayload) {
    const medioPago = await this.suscripcionesService.obtenerMedioPago(usuario.negocioId!);
    return medioPago
      ? { activo: true, ultimosCuatroDigitos: medioPago.ultimosCuatroDigitos }
      : { activo: false, ultimosCuatroDigitos: null };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Delete('medio-pago')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quita el medio de pago guardado — vuelve a reactivación manual' })
  async quitarMedioPago(@CurrentUser() usuario: JwtUserPayload) {
    await this.suscripcionesService.quitarMedioPago(usuario.negocioId!);
    return { mensaje: 'Medio de pago quitado' };
  }

  @Public()
  @Post('webhook-wompi')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook de Wompi para confirmaciones de reactivación — endpoint público, verificado por firma' })
  async webhook(@Body() payload: any) {
    await this.suscripcionesService.procesarWebhookWompi(payload);
    return { received: true };
  }
}
