import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FacturacionElectronicaService } from './facturacion-electronica.service';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';
import { ActualizarDatosNegocioDto } from './dto/actualizar-datos-negocio.dto';
import { CargarResolucionDto } from './dto/cargar-resolucion.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
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
}
