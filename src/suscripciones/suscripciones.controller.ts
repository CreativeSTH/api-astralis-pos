import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { OrigenAuditoriaInterceptor } from '../auditoria/origen-auditoria.interceptor';
import { OrigenAuditoria } from '../auditoria/enums/origen-auditoria.enum';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuscripcionesService } from './suscripciones.service';
import { ReactivarSuscripcionDto } from './dto/reactivar-suscripcion.dto';
import { CancelarSuscripcionDto } from './dto/cancelar-suscripcion.dto';
import { CambiarPaquetePruebaDto } from './dto/cambiar-paquete-prueba.dto';
import { GuardarMedioPagoDto } from './dto/guardar-medio-pago.dto';
import { FiltrosPagosSuscripcionDto } from './dto/filtros-pagos-suscripcion.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { EmailVerificadoGuard } from '../common/guards/email-verificado.guard';
import { Public } from '../common/decorators/public.decorator';
import { RequiereEmailVerificado } from '../common/decorators/requiere-email-verificado.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/decorators/current-user.decorator';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/enums/accion-auditoria.enum';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';

@ApiTags('Suscripción')
@Controller('suscripcion')
export class SuscripcionesController {
  constructor(
    private readonly suscripcionesService: SuscripcionesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private auditar(negocioId: string, entidadId: string, etiqueta: string, accion: AccionAuditoria, descripcion: string) {
    return this.auditoria.registrarAccion({
      modulo: ModuloPermiso.NEGOCIO,
      entidad: 'Suscripcion',
      entidadId,
      etiqueta,
      accion,
      descripcion,
      negocioId,
    });
  }

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
  async cancelar(@CurrentUser() usuario: JwtUserPayload, @Body() dto: CancelarSuscripcionDto) {
    const s = await this.suscripcionesService.cancelar(usuario.negocioId!, dto.motivo);
    const motivo = dto.motivo ? ` — ${dto.motivo}` : '';
    await this.auditar(usuario.negocioId!, s.id, 'Suscripción', AccionAuditoria.CANCELAR, `Canceló la suscripción${motivo}`);
    return s;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('revertir-cancelacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revierte una cancelación mientras el período pagado no venció — gratis' })
  async revertirCancelacion(@CurrentUser() usuario: JwtUserPayload) {
    const s = await this.suscripcionesService.revertirCancelacion(usuario.negocioId!);
    await this.auditar(usuario.negocioId!, s.id, 'Suscripción', AccionAuditoria.REACTIVAR, 'Revirtió la cancelación de la suscripción');
    return s;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Patch('paquete-prueba')
  @ApiOperation({ summary: 'Cambia de plan sin pagar, solo mientras dure la prueba gratis' })
  async cambiarPaqueteEnPrueba(@CurrentUser() usuario: JwtUserPayload, @Body() dto: CambiarPaquetePruebaDto) {
    const s = await this.suscripcionesService.cambiarPaqueteEnPrueba(usuario.negocioId!, dto.paqueteId);
    await this.auditar(usuario.negocioId!, s.id, 'Suscripción', AccionAuditoria.EDITAR, 'Cambió el plan durante la prueba gratis');
    return s;
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
  @Get('pagos')
  @ApiOperation({ summary: 'Historial de pagos de la suscripción del negocio, más reciente primero' })
  pagos(@CurrentUser() usuario: JwtUserPayload, @Query() filtros: FiltrosPagosSuscripcionDto) {
    return this.suscripcionesService.historialPagos(usuario.negocioId!, filtros);
  }

  @UseGuards(JwtAuthGuard, EmailVerificadoGuard)
  @RequiereEmailVerificado()
  @ApiBearerAuth('JWT-auth')
  @Post('medio-pago')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guarda (o reemplaza) la tarjeta del cobro automático, sin cobrar' })
  async guardarMedioPago(@CurrentUser() usuario: JwtUserPayload, @Body() dto: GuardarMedioPagoDto) {
    const r = await this.suscripcionesService.registrarMedioPago(usuario.negocioId!, dto);
    await this.auditar(
      usuario.negocioId!,
      usuario.negocioId!,
      'Tarjeta de cobro automático',
      AccionAuditoria.EDITAR,
      `Guardó la tarjeta terminada en ${r.ultimosCuatroDigitos} para el cobro automático`,
    );
    return r;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Delete('medio-pago')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quita el medio de pago guardado — vuelve a reactivación manual' })
  async quitarMedioPago(@CurrentUser() usuario: JwtUserPayload) {
    await this.suscripcionesService.quitarMedioPago(usuario.negocioId!);
    await this.auditar(
      usuario.negocioId!,
      usuario.negocioId!,
      'Tarjeta de cobro automático',
      AccionAuditoria.ELIMINAR,
      'Quitó la tarjeta del cobro automático',
    );
    return { mensaje: 'Medio de pago quitado' };
  }

  @Public()
  @UseInterceptors(new OrigenAuditoriaInterceptor(OrigenAuditoria.WEBHOOK))
  @Post('webhook-wompi')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook de Wompi para confirmaciones de reactivación — endpoint público, verificado por firma' })
  async webhook(@Body() payload: any) {
    await this.suscripcionesService.procesarWebhookWompi(payload);
    return { received: true };
  }
}
