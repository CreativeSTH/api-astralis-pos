import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HabilitacionFacturacionElectronica } from './entities/habilitacion-facturacion-electronica.entity';
import { DocumentoElectronico } from './entities/documento-electronico.entity';
import { EstadoHabilitacion } from './entities/estado-habilitacion.enum';
import { EstadoDocumentoElectronico } from './entities/estado-documento-electronico.enum';
import { AlegraClientService } from './alegra-client.service';
import { ActualizarDatosNegocioDto } from './dto/actualizar-datos-negocio.dto';
import { CargarResolucionDto } from './dto/cargar-resolucion.dto';
import { encriptar } from '../common/utils/cifrado';
import { Negocio } from '../negocios/entities/negocio.entity';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';
import { Alerta } from '../alertas/entities/alerta.entity';
import { TipoAlerta, SeveridadAlerta } from '../common/enums/alerta.enum';
import { RealtimeGateway } from '../realtime/realtime.gateway';

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
    @InjectRepository(Alerta)
    private readonly alertasRepository: Repository<Alerta>,
    private readonly alegraClient: AlegraClientService,
    private readonly suscripcionesService: SuscripcionesService,
    private readonly realtimeGateway: RealtimeGateway,
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

  async confirmarTestSet(negocioId: string): Promise<HabilitacionFacturacionElectronica> {
    const habilitacion = await this.obtenerOCrearHabilitacion(negocioId);
    if (habilitacion.estado !== EstadoHabilitacion.RESOLUCION_CARGADA) {
      throw new BadRequestException('Completá primero la carga de la resolución (Paso 3)');
    }

    try {
      const token = process.env.ALEGRA_RESELLER_TOKEN!;
      const baseUrl = baseUrlPara(habilitacion.ambiente);

      const { testSetId } = await this.alegraClient.crearTestSet({
        token,
        baseUrl,
        companyId: habilitacion.alegraCompanyId!,
      });
      habilitacion.alegraGovernmentTestSetId = testSetId;

      const numeroPrueba = habilitacion.siguienteNumero ?? habilitacion.resolucionRangoDesde!;
      const documentoPrueba = () =>
        this.alegraClient.crearDocumentoEquivalentePos({
          token,
          baseUrl,
          companyId: habilitacion.alegraCompanyId!,
          number: numeroPrueba,
          items: [{ description: 'Producto de prueba', quantity: 1, price: 10000 }],
          totalAmounts: { total: 10000 },
          payments: [{ type: 'CASH', amount: 10000 }],
        });

      const doc1 = await documentoPrueba();
      await documentoPrueba();
      await this.alegraClient.crearNotaAjuste({
        token,
        baseUrl,
        companyId: habilitacion.alegraCompanyId!,
        documentoOrigenId: doc1.alegraDocumentId,
        motivo: 'Nota de ajuste de prueba — testset de habilitación DIAN',
      });

      // Los documentos de prueba del testset no consumen numeración real —
      // Alegra los trata aparte (no quedan en el pool operativo del negocio).
      habilitacion.estado = EstadoHabilitacion.HABILITADO;
      habilitacion.ambiente = 'PRODUCCION';
      habilitacion.errorMensaje = undefined;
    } catch (error) {
      habilitacion.estado = EstadoHabilitacion.ERROR;
      habilitacion.errorMensaje = error instanceof Error ? error.message : String(error);
    }

    return this.habilitacionRepository.save(habilitacion);
  }

  /**
   * Fail-closed: sin habilitación HABILITADO, no se crea nada — evita reintentos
   * infinitos contra un negocio que ni siquiera puede facturar todavía.
   * Se llama de forma NO bloqueante desde VentasService.crear() (ver Task 6) —
   * nunca debe lanzar una excepción que se propague hacia arriba, por eso el
   * try/catch de intentarEmitir envuelve toda la lógica real de red.
   */
  async emitirDocumento(venta: { id: string; negocioId: string; tipoComprobanteEmitido?: string }): Promise<void> {
    const habilitacion = await this.habilitacionRepository.findOne({ where: { negocioId: venta.negocioId } });
    if (!habilitacion || habilitacion.estado !== EstadoHabilitacion.HABILITADO) return;

    const documento = this.documentosRepository.create({
      negocioId: venta.negocioId,
      ventaId: venta.id,
      tipo: venta.tipoComprobanteEmitido === 'FACTURA' ? 'FACTURA' : 'DEE_POS',
      estado: EstadoDocumentoElectronico.PENDIENTE,
    });
    await this.documentosRepository.save(documento);

    await this.intentarEmitir(documento, habilitacion);
  }

  /** Compartido entre la emisión inicial (arriba) y el cron de reintento (Task 7). */
  async intentarEmitir(
    documento: DocumentoElectronico,
    habilitacion: HabilitacionFacturacionElectronica,
  ): Promise<void> {
    const token = process.env.ALEGRA_RESELLER_TOKEN!;
    const baseUrl = baseUrlPara(habilitacion.ambiente);

    documento.intentos += 1;
    documento.ultimoIntentoEn = new Date();

    // Numeración correlativa real dentro del rango de la resolución — nunca el
    // contador de reintentos (documento.intentos), que solo mide llamadas de red.
    const numero = habilitacion.siguienteNumero ?? habilitacion.resolucionRangoDesde ?? 1;

    try {
      const resultado =
        documento.tipo === 'DEE_POS'
          ? await this.alegraClient.crearDocumentoEquivalentePos({
              token,
              baseUrl,
              companyId: habilitacion.alegraCompanyId!,
              number: numero,
              items: [],
              totalAmounts: {},
              payments: [],
            })
          : await this.alegraClient.crearFactura({
              token,
              baseUrl,
              companyId: habilitacion.alegraCompanyId!,
              number: numero,
              customer: {},
              items: [],
              totalAmounts: {},
              payments: [],
            });

      documento.alegraDocumentId = resultado.alegraDocumentId;
      if ('cude' in resultado) documento.cude = resultado.cude;
      if ('cufe' in resultado) documento.cufe = resultado.cufe;

      if (resultado.legalStatus === 'ACCEPTED') {
        documento.estado = EstadoDocumentoElectronico.ACEPTADO;
      } else if (resultado.legalStatus === 'ACCEPTED_WITH_OBSERVATIONS') {
        documento.estado = EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES;
      } else if (resultado.legalStatus === 'REJECTED') {
        documento.estado = EstadoDocumentoElectronico.RECHAZADO;
      } // si no hay legalStatus todavía (WAITING_RESPONSE), documento queda PENDIENTE para el próximo reintento/webhook.

      // El envío llegó a Alegra (no lanzó) — el número quedó consumido ante la DIAN,
      // así que el correlativo avanza sin importar si terminó ACEPTADO o RECHAZADO.
      habilitacion.siguienteNumero = numero + 1;
      await this.habilitacionRepository.save(habilitacion);
    } catch (error) {
      documento.errorMensaje = error instanceof Error ? error.message : String(error);
      // EPR5xx (mantenimiento DIAN) no cuenta como fallo real — se resta el intento que se acaba de sumar arriba.
      if (documento.errorMensaje?.includes('EPR5')) {
        documento.intentos -= 1;
      }
    }

    await this.documentosRepository.save(documento);

    if (
      documento.estado === EstadoDocumentoElectronico.ACEPTADO ||
      documento.estado === EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES
    ) {
      await this.suscripcionesService.registrarConsumo(documento.negocioId, 'documentosDianPorMes');
    }
  }

  async procesarWebhookAlegra(payload: { documentId?: string; status?: string; legalStatus?: string }): Promise<void> {
    if (!payload?.documentId) return;
    const documento = await this.documentosRepository.findOne({ where: { alegraDocumentId: payload.documentId } });
    if (!documento || documento.estado !== EstadoDocumentoElectronico.PENDIENTE) return;

    if (payload.legalStatus === 'ACCEPTED') {
      documento.estado = EstadoDocumentoElectronico.ACEPTADO;
    } else if (payload.legalStatus === 'ACCEPTED_WITH_OBSERVATIONS') {
      documento.estado = EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES;
    } else if (payload.legalStatus === 'REJECTED') {
      documento.estado = EstadoDocumentoElectronico.RECHAZADO;
    } else {
      return; // estado intermedio, sin novedad todavía
    }
    await this.documentosRepository.save(documento);

    if (
      documento.estado === EstadoDocumentoElectronico.ACEPTADO ||
      documento.estado === EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES
    ) {
      await this.suscripcionesService.registrarConsumo(documento.negocioId, 'documentosDianPorMes');
    }
  }

  /** Backoff simple: reintenta cada documento PENDIENTE que no se tocó en los últimos 5 minutos. */
  async reconciliarPendientes(): Promise<void> {
    const haceCincoMin = new Date(Date.now() - 5 * 60 * 1000);
    const pendientes = await this.documentosRepository.find({ where: { estado: EstadoDocumentoElectronico.PENDIENTE } });

    for (const documento of pendientes) {
      if (documento.ultimoIntentoEn && documento.ultimoIntentoEn > haceCincoMin) continue;
      const habilitacion = await this.habilitacionRepository.findOne({ where: { negocioId: documento.negocioId } });
      if (!habilitacion || habilitacion.estado !== EstadoHabilitacion.HABILITADO) continue;
      await this.intentarEmitir(documento, habilitacion);
    }
  }

  /**
   * A las 48h de contingencia sin resolver: alerta CRITICA, mismo patrón que la pieza de
   * notificaciones de pago. El corte de 48h lo calcula Postgres (`NOW() - INTERVAL`), no
   * un `Date` de Node pasado como parámetro — `created_at` es TIMESTAMP sin tz (igual que el
   * resto del esquema) y comparar contra un valor calculado del lado del cliente ya causó
   * una ventana desfasada por huso horario en otra pieza (ver docs/ARQUITECTURA-V2.md fila 0.b).
   */
  async alertarDocumentosVencidos(): Promise<void> {
    const vencidos = await this.documentosRepository
      .createQueryBuilder('doc')
      .where('doc.estado = :estado', { estado: EstadoDocumentoElectronico.PENDIENTE })
      .andWhere(`doc.created_at < NOW() - INTERVAL '48 hours'`)
      .getMany();

    for (const documento of vencidos) {
      const existente = await this.alertasRepository.findOne({
        where: { negocioId: documento.negocioId, tipo: TipoAlerta.FACTURACION_DIAN_VENCIDA, referenciaId: documento.id, resuelta: false },
      });
      const mensaje = `Documento electrónico de la venta ${documento.ventaId} sin emitir hace más de 48h — revisar manualmente`;
      if (existente) {
        existente.mensaje = mensaje;
        const actualizada = await this.alertasRepository.save(existente);
        this.realtimeGateway.emitToNegocio(documento.negocioId, 'alertas:cambio', actualizada);
        continue;
      }
      const creada = await this.alertasRepository.save(
        this.alertasRepository.create({
          negocioId: documento.negocioId,
          tipo: TipoAlerta.FACTURACION_DIAN_VENCIDA,
          referenciaId: documento.id,
          severidad: SeveridadAlerta.CRITICA,
          mensaje,
        }),
      );
      this.realtimeGateway.emitToNegocio(documento.negocioId, 'alertas:cambio', creada);
    }
  }
}
