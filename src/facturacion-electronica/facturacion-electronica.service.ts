import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HabilitacionFacturacionElectronica } from './entities/habilitacion-facturacion-electronica.entity';
import { DocumentoElectronico } from './entities/documento-electronico.entity';
import { EstadoHabilitacion } from './entities/estado-habilitacion.enum';
import { AlegraClientService } from './alegra-client.service';
import { ActualizarDatosNegocioDto } from './dto/actualizar-datos-negocio.dto';
import { CargarResolucionDto } from './dto/cargar-resolucion.dto';
import { encriptar } from '../common/utils/cifrado';
import { Negocio } from '../negocios/entities/negocio.entity';

export function baseUrlPara(ambiente: 'SANDBOX' | 'PRODUCCION'): string {
  return ambiente === 'PRODUCCION' ? process.env.ALEGRA_BASE_URL_PRODUCCION! : process.env.ALEGRA_BASE_URL_SANDBOX!;
}

@Injectable()
export class FacturacionElectronicaService {
  constructor(
    @InjectRepository(HabilitacionFacturacionElectronica)
    private readonly habilitacionRepository: Repository<HabilitacionFacturacionElectronica>,
    @InjectRepository(DocumentoElectronico)
    private readonly documentosRepository: Repository<DocumentoElectronico>,
    @InjectRepository(Negocio)
    private readonly negociosRepository: Repository<Negocio>,
    private readonly alegraClient: AlegraClientService,
  ) {}

  async obtenerOCrearHabilitacion(negocioId: string): Promise<HabilitacionFacturacionElectronica> {
    const existente = await this.habilitacionRepository.findOne({ where: { negocioId } });
    if (existente) return existente;
    return this.habilitacionRepository.save(
      this.habilitacionRepository.create({ negocioId, estado: EstadoHabilitacion.DATOS_NEGOCIO }),
    );
  }

  async actualizarDatosNegocio(
    negocioId: string,
    dto: ActualizarDatosNegocioDto,
  ): Promise<HabilitacionFacturacionElectronica> {
    const habilitacion = await this.obtenerOCrearHabilitacion(negocioId);
    habilitacion.razonSocial = dto.razonSocial;
    habilitacion.direccion = dto.direccion;
    habilitacion.ciudad = dto.ciudad;
    habilitacion.useAlegraCertificate = dto.useAlegraCertificate;
    if (!dto.useAlegraCertificate) {
      if (!dto.certificadoPfxBase64 || !dto.certificadoPassword) {
        throw new BadRequestException('Certificado propio requiere certificadoPfxBase64 y certificadoPassword');
      }
      habilitacion.certificadoPfxCifrado = encriptar(dto.certificadoPfxBase64);
      habilitacion.certificadoPasswordCifrado = encriptar(dto.certificadoPassword);
    }
    habilitacion.estado = EstadoHabilitacion.ESPERANDO_TRAMITE_DIAN;
    return this.habilitacionRepository.save(habilitacion);
  }

  async confirmarTramiteDian(negocioId: string): Promise<HabilitacionFacturacionElectronica> {
    const habilitacion = await this.obtenerOCrearHabilitacion(negocioId);
    if (habilitacion.estado !== EstadoHabilitacion.ESPERANDO_TRAMITE_DIAN) {
      throw new BadRequestException('Completá primero los datos del negocio (Paso 1)');
    }
    return habilitacion; // El estado avanza recién al cargar la resolución (Paso 3) — este paso es solo informativo.
  }

  async cargarResolucion(
    negocioId: string,
    dto: CargarResolucionDto,
  ): Promise<HabilitacionFacturacionElectronica> {
    const habilitacion = await this.obtenerOCrearHabilitacion(negocioId);
    if (habilitacion.estado !== EstadoHabilitacion.ESPERANDO_TRAMITE_DIAN) {
      throw new BadRequestException('Completá primero los pasos anteriores del wizard');
    }
    if (!habilitacion.razonSocial) {
      throw new BadRequestException('Faltan los datos del negocio (Paso 1)');
    }

    habilitacion.resolucionNumero = dto.numero;
    habilitacion.resolucionPrefijo = dto.prefijo;
    habilitacion.resolucionFechaInicio = dto.fechaInicio;
    habilitacion.resolucionFechaFin = dto.fechaFin;
    habilitacion.resolucionRangoDesde = dto.rangoDesde;
    habilitacion.resolucionRangoHasta = dto.rangoHasta;
    habilitacion.resolucionTechnicalKey = dto.technicalKey;
    // Arranca la numeración correlativa real en el piso del rango autorizado —
    // no confundir con documento.intentos (contador de reintentos de red, ver intentarEmitir).
    habilitacion.siguienteNumero = dto.rangoDesde;

    const negocio = await this.negociosRepository.findOneOrFail({ where: { id: negocioId } });

    const { companyId } = await this.alegraClient.crearCompania({
      token: process.env.ALEGRA_RESELLER_TOKEN!,
      baseUrl: baseUrlPara(habilitacion.ambiente),
      nit: negocio.nit!,
      razonSocial: habilitacion.razonSocial,
      direccion: habilitacion.direccion!,
      ciudad: habilitacion.ciudad!,
      useAlegraCertificate: habilitacion.useAlegraCertificate,
    });

    habilitacion.alegraCompanyId = companyId;
    habilitacion.estado = EstadoHabilitacion.RESOLUCION_CARGADA;
    return this.habilitacionRepository.save(habilitacion);
  }
}
