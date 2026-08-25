import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Public } from '../common/decorators/public.decorator';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { PagosService } from './pagos.service';
import type { WompiWebhookPayload } from './pagos.service';
import { ConfigurarWompiDto } from './dto/configurar-wompi.dto';
import { IniciarPagoDto } from './dto/iniciar-pago.dto';

@ApiTags('Pagos')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pagos/wompi')
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  @Get('configuracion')
  @RequierePermiso(ModuloPermiso.PAGOS, AccionPermiso.VER)
  @ApiOperation({
    summary: 'Estado público de la configuración de Wompi del negocio',
  })
  obtenerConfiguracion() {
    return this.pagosService.obtenerConfiguracionPublica();
  }

  @Post('configuracion')
  @RequierePermiso(ModuloPermiso.PAGOS, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Guardar/actualizar las credenciales de Wompi' })
  guardarConfiguracion(@Body() dto: ConfigurarWompiDto) {
    return this.pagosService.guardarConfiguracion(dto);
  }

  @Patch('activar')
  @RequierePermiso(ModuloPermiso.PAGOS, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Activar Wompi para el negocio' })
  activar() {
    return this.pagosService.activar();
  }

  @Patch('desactivar')
  @RequierePermiso(ModuloPermiso.PAGOS, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Desactivar Wompi para el negocio' })
  desactivar() {
    return this.pagosService.desactivar();
  }

  @Post('iniciar')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.CREAR)
  @ApiOperation({ summary: 'Iniciar un pago con Wompi (QR/Nequi/PSE/Tarjeta)' })
  iniciarPago(@Body() dto: IniciarPagoDto) {
    return this.pagosService.iniciarPago(dto);
  }

  @Public()
  @Post('webhook')
  @ApiOperation({
    summary: 'Webhook de eventos de Wompi (sin JWT, autenticado por firma)',
  })
  recibirWebhook(@Body() payload: WompiWebhookPayload) {
    return this.pagosService.procesarWebhook(payload);
  }
}
