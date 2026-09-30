import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ContingenciaService } from './contingencia.service';
import { CartaContingenciaPdfService } from './carta-contingencia-pdf.service';
import { CargarResolucionContingenciaDto } from './dto/cargar-resolucion-contingencia.dto';
import { DeclararContingenciaDto } from './dto/declarar-contingencia.dto';
import { FinalizarContingenciaDto } from './dto/finalizar-contingencia.dto';
import { DocumentoElectronico } from './entities/documento-electronico.entity';
import { HabilitacionFacturacionElectronica } from './entities/habilitacion-facturacion-electronica.entity';
import { nitConDv } from './factura-pdf.service';
import { Negocio } from '../negocios/entities/negocio.entity';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/decorators/current-user.decorator';

class MarcarAvisoDto {
  @IsIn(['INICIO', 'FIN'])
  tipo: 'INICIO' | 'FIN';
}

/** Contingencia del facturador (fase 6a — spec de unificación de comprobantes, sección 12). */
@ApiTags('Facturación Electrónica DIAN — contingencia')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('facturacion-electronica/contingencia')
export class ContingenciaController {
  constructor(
    private readonly contingencia: ContingenciaService,
    private readonly carta: CartaContingenciaPdfService,
    private readonly suscripcionesService: SuscripcionesService,
    @InjectRepository(DocumentoElectronico) private readonly documentos: Repository<DocumentoElectronico>,
    @InjectRepository(HabilitacionFacturacionElectronica)
    private readonly habilitaciones: Repository<HabilitacionFacturacionElectronica>,
    @InjectRepository(Negocio) private readonly negocios: Repository<Negocio>,
  ) {}

  private async exigirFeatureHabilitada(negocioId: string): Promise<void> {
    const habilitado = await this.suscripcionesService.tieneFeature(negocioId, 'facturacionDianHabilitada');
    if (!habilitado) {
      throw new ForbiddenException('Tu paquete actual no incluye Facturación Electrónica DIAN');
    }
  }

  @Get()
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.VER)
  estado(@CurrentUser() u: JwtUserPayload) {
    return this.contingencia.estado(u.negocioId!);
  }

  @Post('resolucion')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Carga la resolución de numeración tipo "Factura de talonario o de papel"' })
  async cargarResolucion(@CurrentUser() u: JwtUserPayload, @Body() dto: CargarResolucionContingenciaDto) {
    await this.exigirFeatureHabilitada(u.negocioId!);
    return this.contingencia.cargarResolucion(u.negocioId!, dto);
  }

  @Post('declarar')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.EDITAR)
  async declarar(@CurrentUser() u: JwtUserPayload, @Body() dto: DeclararContingenciaDto) {
    await this.exigirFeatureHabilitada(u.negocioId!);
    return this.contingencia.declarar(u.negocioId!, u.sub, dto);
  }

  @Post('finalizar')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.EDITAR)
  finalizar(@CurrentUser() u: JwtUserPayload, @Body() dto: FinalizarContingenciaDto) {
    return this.contingencia.finalizar(u.negocioId!, u.sub, dto);
  }

  @Post('periodos/:id/aviso')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.EDITAR)
  marcarAviso(@CurrentUser() u: JwtUserPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MarcarAvisoDto) {
    return this.contingencia.marcarAviso(u.negocioId!, id, dto.tipo);
  }

  @Get('periodos/:id/carta')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.VER)
  async cartaPdf(
    @CurrentUser() u: JwtUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tipo') tipo: string,
  ): Promise<StreamableFile> {
    if (tipo !== 'INICIO' && tipo !== 'FIN') throw new BadRequestException('tipo debe ser INICIO o FIN');
    const periodo = await this.contingencia.periodoDelNegocio(u.negocioId!, id);
    if (tipo === 'FIN' && !periodo.fin) throw new BadRequestException('La contingencia todavía no termina');
    const negocio = await this.negocios.findOneOrFail({ where: { id: u.negocioId! } });
    const habilitacion = await this.habilitaciones.findOne({ where: { negocioId: u.negocioId! } });
    // El emisor de la carta es el negocio (su razón social y su NIT), nunca AURA.
    const pdf = await this.carta.generar({
      tipo,
      razonSocial: habilitacion?.razonSocial ?? negocio.nombre,
      nitConDv: nitConDv(negocio.nit),
      ciudad: habilitacion?.ciudad ?? negocio.ciudadNombre ?? '',
      motivo: periodo.motivo,
      inicio: periodo.inicio,
      fin: periodo.fin,
    });
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="carta-contingencia-${tipo.toLowerCase()}.pdf"`,
    });
  }

  @Get('documentos')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.VER)
  documentosDeContingencia(@CurrentUser() u: JwtUserPayload, @Query('periodoId') periodoId?: string) {
    return this.documentos.find({
      where: { negocioId: u.negocioId!, periodoContingenciaId: periodoId ? periodoId : Not(IsNull()) },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }
}
