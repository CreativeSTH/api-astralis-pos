import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FacturacionElectronicaService } from './facturacion-electronica.service';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';
import { ActualizarDatosNegocioDto } from './dto/actualizar-datos-negocio.dto';
import { CargarResolucionDto } from './dto/cargar-resolucion.dto';
import { FiltrosFacturasDto } from './dto/filtros-facturas.dto';
import { EnviarCorreoFacturaDto } from './dto/enviar-correo-factura.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Facturación Electrónica DIAN')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('facturacion-electronica')
export class FacturacionElectronicaController {
  constructor(
    private readonly facturacionService: FacturacionElectronicaService,
    private readonly suscripcionesService: SuscripcionesService,
  ) {}

  private async exigirFeatureHabilitada(negocioId: string): Promise<void> {
    const habilitado = await this.suscripcionesService.tieneFeature(negocioId, 'facturacionDianHabilitada');
    if (!habilitado) {
      throw new ForbiddenException('Tu paquete actual no incluye Facturación Electrónica DIAN');
    }
  }

  @Get('habilitacion')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.VER)
  async miHabilitacion(@CurrentUser() usuario: JwtUserPayload) {
    await this.exigirFeatureHabilitada(usuario.negocioId!);
    return this.facturacionService.obtenerOCrearHabilitacion(usuario.negocioId!);
  }

  @Post('habilitacion/datos-negocio')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Wizard Paso 1' })
  async actualizarDatosNegocio(@CurrentUser() usuario: JwtUserPayload, @Body() dto: ActualizarDatosNegocioDto) {
    await this.exigirFeatureHabilitada(usuario.negocioId!);
    return this.facturacionService.actualizarDatosNegocio(usuario.negocioId!, dto);
  }

  @Post('habilitacion/confirmar-tramite-dian')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Wizard Paso 2' })
  async confirmarTramiteDian(@CurrentUser() usuario: JwtUserPayload) {
    await this.exigirFeatureHabilitada(usuario.negocioId!);
    return this.facturacionService.confirmarTramiteDian(usuario.negocioId!);
  }

  @Post('habilitacion/resolucion')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Wizard Paso 3' })
  async cargarResolucion(@CurrentUser() usuario: JwtUserPayload, @Body() dto: CargarResolucionDto) {
    await this.exigirFeatureHabilitada(usuario.negocioId!);
    return this.facturacionService.cargarResolucion(usuario.negocioId!, dto);
  }

  @Post('habilitacion/testset')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Wizard Paso 4' })
  async confirmarTestSet(@CurrentUser() usuario: JwtUserPayload) {
    await this.exigirFeatureHabilitada(usuario.negocioId!);
    return this.facturacionService.confirmarTestSet(usuario.negocioId!);
  }

  @Post('habilitacion/sandbox-de-prueba')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Probar Facturación DIAN sin trámite real — solo disponible durante PRUEBA' })
  async activarModoSandboxDePrueba(@CurrentUser() usuario: JwtUserPayload, @Body() dto: ActualizarDatosNegocioDto) {
    await this.exigirFeatureHabilitada(usuario.negocioId!);
    return this.facturacionService.activarModoSandboxDePrueba(usuario.negocioId!, dto);
  }

  @Post('habilitacion/volver-a-real')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Sale del modo sandbox de prueba, conservando los datos del negocio ya cargados' })
  async volverAModoReal(@CurrentUser() usuario: JwtUserPayload) {
    await this.exigirFeatureHabilitada(usuario.negocioId!);
    return this.facturacionService.volverAModoReal(usuario.negocioId!);
  }

  @Public()
  @Post('webhook-alegra')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Webhook de Alegra — endpoint público. Sin verificación de firma todavía (ver nota de la Task 7 del plan): confirmar contra el sandbox real si Alegra firma sus eventos antes de exponer esto en producción.',
  })
  async webhookAlegra(@Body() payload: any) {
    await this.facturacionService.procesarWebhookAlegra(payload);
    return { received: true };
  }

  @Get('documentos/:ventaId')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.VER)
  async miDocumento(@CurrentUser() usuario: JwtUserPayload, @Param('ventaId', ParseUUIDPipe) ventaId: string) {
    return this.facturacionService.obtenerDocumentoPorVenta(ventaId, usuario.negocioId!);
  }

  @Post('documentos/:ventaId/reintentar')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.EDITAR)
  async reintentarDocumento(@CurrentUser() usuario: JwtUserPayload, @Param('ventaId', ParseUUIDPipe) ventaId: string) {
    return this.facturacionService.reintentarPorVenta(ventaId, usuario.negocioId!);
  }

  // ── Facturas por id de documento (spec 2026-09-28). Bajo `/facturas`, no `/documentos`:
  // `POST documentos/:ventaId/reintentar` ya existe y Nest no distingue un uuid de venta de uno de documento.

  @Get('facturas')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.VER)
  @ApiOperation({ summary: 'Listado paginado de facturas electrónicas del negocio, con resumen por estado' })
  async listarFacturas(@CurrentUser() usuario: JwtUserPayload, @Query() filtros: FiltrosFacturasDto) {
    await this.exigirFeatureHabilitada(usuario.negocioId!);
    return this.facturacionService.listarFacturas(usuario.negocioId!, filtros);
  }

  @Get('facturas/:id')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.VER)
  async obtenerFactura(@CurrentUser() usuario: JwtUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.exigirFeatureHabilitada(usuario.negocioId!);
    return this.facturacionService.obtenerFactura(id, usuario.negocioId!);
  }

  @Get('facturas/:id/pdf')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.VER)
  @ApiOperation({ summary: 'Representación gráfica (PDF carta) generada por AURA — Alegra no genera PDF' })
  async pdfFactura(@CurrentUser() usuario: JwtUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.exigirFeatureHabilitada(usuario.negocioId!);
    const { nombreArchivo, contenido } = await this.facturacionService.generarPdf(id, usuario.negocioId!);
    return new StreamableFile(contenido, { type: 'application/pdf', disposition: `inline; filename="${nombreArchivo}"` });
  }

  @Get('facturas/:id/xml')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.VER)
  async xmlFactura(@CurrentUser() usuario: JwtUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.exigirFeatureHabilitada(usuario.negocioId!);
    const { nombreArchivo, contenido } = await this.facturacionService.descargarXml(id, usuario.negocioId!);
    return new StreamableFile(contenido, { type: 'application/xml', disposition: `attachment; filename="${nombreArchivo}"` });
  }

  @Post('facturas/:id/reintentar')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.EDITAR)
  async reintentarFactura(@CurrentUser() usuario: JwtUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.exigirFeatureHabilitada(usuario.negocioId!);
    return this.facturacionService.reintentarFactura(id, usuario.negocioId!);
  }

  @Post('facturas/:id/enviar-correo')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Envía (o reenvía) la factura aceptada al correo del cliente: ZIP DIAN con PDF + AttachedDocument' })
  async enviarCorreoFactura(
    @CurrentUser() usuario: JwtUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EnviarCorreoFacturaDto,
  ) {
    await this.exigirFeatureHabilitada(usuario.negocioId!);
    return this.facturacionService.enviarCorreoFactura(id, usuario.negocioId!, dto.correo);
  }
}
