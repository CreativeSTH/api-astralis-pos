import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { HabilitacionFacturacionElectronica } from './entities/habilitacion-facturacion-electronica.entity';
import { DocumentoElectronico } from './entities/documento-electronico.entity';
import { EstadoHabilitacion } from './entities/estado-habilitacion.enum';
import { EstadoDocumentoElectronico } from './entities/estado-documento-electronico.enum';
import {
  AlegraClientService,
  AlegraNoDisponibleError,
  DOCUMENT_TYPE_CONTINGENCIA_FACTURADOR,
  CustomerAlegra,
  DocumentoAsociadoAlegra,
  ItemFacturaAlegra,
  PaymentAlegra,
  ResolutionAlegra,
  TotalAmountsFacturaAlegra,
} from './alegra-client.service';
import { ActualizarDatosNegocioDto } from './dto/actualizar-datos-negocio.dto';
import { CargarResolucionDto } from './dto/cargar-resolucion.dto';
import { FiltrosFacturasDto } from './dto/filtros-facturas.dto';
import { FacturaPdfService } from './factura-pdf.service';
import { LogoNegocioService } from './logo-negocio.service';
import { ContingenciaService } from './contingencia.service';
import { contenidoQrContingencia, resolucionContingenciaDesdeDocumento } from './contingencia.util';
import { encriptar, desencriptar } from '../common/utils/cifrado';
import { Negocio } from '../negocios/entities/negocio.entity';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';
import { Alerta } from '../alertas/entities/alerta.entity';
import { TipoAlerta, SeveridadAlerta } from '../common/enums/alerta.enum';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Venta } from '../ventas/entities/venta.entity';
import { TipoComprobanteVenta } from '../common/enums/tipo-comprobante.enum';
import { calcularDigitoVerificacion, limpiarNit } from '../common/utils/nit';
import { diaColombia, finDiaColombia, inicioDiaColombia } from '../common/utils/fecha-colombia';

export function baseUrlPara(ambiente: 'SANDBOX' | 'PRODUCCION'): string {
  return ambiente === 'PRODUCCION' ? process.env.ALEGRA_BASE_URL_PRODUCCION! : process.env.ALEGRA_BASE_URL_SANDBOX!;
}

/**
 * Persona Jurídica (catálogo DIAN de tipo de organización) — el POS no distingue
 * persona natural/jurídica hoy, y la enorme mayoría de negocios que facturan con
 * NIT son personas jurídicas. Confirmado en vivo que sin este campo Alegra
 * rechaza la emisión con AEP6012 aunque la empresa se haya creado "bien".
 */
const ORGANIZATION_TYPE_PERSONA_JURIDICA = 1;
/** NIT (catálogo DIAN de tipo de identificación) — mismo criterio que arriba. */
const IDENTIFICATION_TYPE_NIT = '31';
/**
 * "O-48" = Responsable de IVA (catálogo DIAN de obligaciones/responsabilidades
 * fiscales, patrón `O-(13|15|23|47|48|49)|R-99-PN`) — confirmado en vivo que
 * `company.regimeCode` es obligatorio en `/invoices` sin excepción. El POS no
 * modela hoy negocios que NO sean responsables de IVA (todo producto tiene un
 * `porcentajeImpuesto` configurable), así que este valor fijo cubre el caso
 * real de todos los negocios que usan el sistema hoy.
 */
const REGIME_CODE_RESPONSABLE_IVA = 'O-48';

/**
 * Datos placeholder para el modo sandbox de prueba (docs/specs/2026-09-06-sandbox-instantaneo-facturacion-dian.md,
 * sección 3) — punto de partida, no un hecho confirmado. A diferencia de SANDBOX_GOVERNMENT_TEST_SET_ID (público,
 * ya usado hoy en el wizard real), no hay evidencia pública de un valor "oficial" de sandbox para el resto de estos
 * campos; se verifican en vivo contra el sandbox real de Alegra (ver plan, Task 8) y se ajustan acá si Alegra
 * rechaza alguno, sin tocar el resto del diseño.
 */
const SANDBOX_PREFIJO = 'SBOX'; // confirmado en vivo: Alegra rechaza 'PRUEBA' con "prefix does not meet maximum length of 4"
const SANDBOX_RESOLUCION_NUMERO = '00000000000000';
const SANDBOX_RANGO_DESDE = 1;
const SANDBOX_RANGO_HASTA = 100000;
const SANDBOX_TECHNICAL_KEY = 'fc8eac422eba16e22ffd8c6f94b3f40a6e38162c';
const SANDBOX_GOVERNMENT_TEST_SET_ID = 'a70562e0-631e-4ceb-aa65-36887b57dc17';
const SANDBOX_FECHA_INICIO = '2020-01-01';
const SANDBOX_FECHA_FIN = '2030-12-31';

/** Lo que Alegra devuelve de una factura y hace falta para la representación gráfica (PDF). */
type DatosAlegraFactura = {
  cufe?: string;
  fullNumber?: string;
  prefix?: string;
  number?: number;
  fecha?: string;
  qrCodeContent?: string;
};

export interface ListadoFacturas {
  items: DocumentoElectronico[];
  total: number;
  pagina: number;
  porPagina: number;
  resumen: { aceptados: number; pendientes: number; rechazados: number };
  tieneLogo: boolean;
}

@Injectable()
export class FacturacionElectronicaService {
  private readonly logger = new Logger(FacturacionElectronicaService.name);

  constructor(
    @InjectRepository(HabilitacionFacturacionElectronica)
    private readonly habilitacionRepository: Repository<HabilitacionFacturacionElectronica>,
    @InjectRepository(DocumentoElectronico)
    private readonly documentosRepository: Repository<DocumentoElectronico>,
    @InjectRepository(Negocio)
    private readonly negociosRepository: Repository<Negocio>,
    @InjectRepository(Alerta)
    private readonly alertasRepository: Repository<Alerta>,
    @InjectRepository(Venta)
    private readonly ventasRepository: Repository<Venta>,
    private readonly alegraClient: AlegraClientService,
    private readonly suscripcionesService: SuscripcionesService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly facturaPdf: FacturaPdfService,
    private readonly logoNegocio: LogoNegocioService,
    private readonly contingencia: ContingenciaService,
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

    // NIT y email nacen vacíos en cualquier negocio (registro público, o creado
    // por SISTEMA sin llenar "Datos del negocio") — acá es donde se exigen de
    // verdad, porque crearCompania() (Paso 3) los necesita completos para que
    // Alegra no rechace la creación de la compañía ni, más adelante, el testset.
    const negocio = await this.negociosRepository.findOneOrFail({ where: { id: negocioId } });
    negocio.nit = limpiarNit(dto.nit);
    negocio.email = dto.email;
    await this.negociosRepository.save(negocio);

    habilitacion.razonSocial = dto.razonSocial;
    habilitacion.direccion = dto.direccion;
    habilitacion.ciudad = dto.ciudadNombre;
    habilitacion.ciudadCodigo = dto.ciudadCodigo;
    habilitacion.departamentoCodigo = dto.departamentoCodigo;
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

  /**
   * Atajo para un negocio en PRUEBA: reusa el mismo pipeline de habilitación real
   * (actualizarDatosNegocio → cargarResolucion → confirmarTestSet), autocompletando los campos
   * DIAN que en el flujo real exigen el trámite ante la DIAN. Ver docs/specs/2026-09-06-sandbox-instantaneo-facturacion-dian.md.
   */
  async activarModoSandboxDePrueba(
    negocioId: string,
    dto: ActualizarDatosNegocioDto,
  ): Promise<HabilitacionFacturacionElectronica> {
    const suscripcion = await this.suscripcionesService.miEstado(negocioId);
    if (suscripcion.estado !== 'PRUEBA') {
      throw new BadRequestException('El modo sandbox de prueba solo está disponible durante el trial gratis');
    }

    let habilitacion = await this.actualizarDatosNegocio(negocioId, {
      ...dto,
      useAlegraCertificate: true, // el certificado propio no tiene sentido para una simulación
    });
    habilitacion.esHabilitacionDePrueba = true;
    habilitacion = await this.habilitacionRepository.save(habilitacion);

    await this.cargarResolucion(negocioId, {
      numero: SANDBOX_RESOLUCION_NUMERO,
      prefijo: SANDBOX_PREFIJO,
      fechaInicio: SANDBOX_FECHA_INICIO,
      fechaFin: SANDBOX_FECHA_FIN,
      rangoDesde: SANDBOX_RANGO_DESDE,
      rangoHasta: SANDBOX_RANGO_HASTA,
      technicalKey: SANDBOX_TECHNICAL_KEY,
      governmentTestSetId: SANDBOX_GOVERNMENT_TEST_SET_ID,
    });

    return this.confirmarTestSet(negocioId);
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
    habilitacion.governmentTestSetId = dto.governmentTestSetId;
    // Arranca la numeración correlativa real en el piso del rango autorizado —
    // no confundir con documento.intentos (contador de reintentos de red, ver intentarEmitir).
    habilitacion.siguienteNumero = dto.rangoDesde;

    const negocio = await this.negociosRepository.findOneOrFail({ where: { id: negocioId } });
    if (!negocio.nit) {
      // No debería llegar acá en el flujo normal — actualizarDatosNegocio (Paso 1)
      // ya lo exige. Red de seguridad por si este paso se invoca fuera de orden.
      throw new BadRequestException('Falta el NIT del negocio — volvé al Paso 1 del wizard');
    }
    // El NIT del negocio debe estar SIN el dígito de verificación acá (solo la
    // base) — el dv se calcula siempre con el algoritmo oficial DIAN, nunca se
    // confía en uno que el usuario haya podido tipear pegado al NIT.
    const identification = limpiarNit(negocio.nit);
    const dv = calcularDigitoVerificacion(identification);

    const { companyId } = await this.alegraClient.crearCompania({
      token: process.env.ALEGRA_RESELLER_TOKEN!,
      baseUrl: baseUrlPara(habilitacion.ambiente),
      identification,
      dv,
      identificationType: IDENTIFICATION_TYPE_NIT,
      organizationType: ORGANIZATION_TYPE_PERSONA_JURIDICA,
      razonSocial: habilitacion.razonSocial,
      direccion: habilitacion.direccion!,
      ciudadCodigo: habilitacion.ciudadCodigo!,
      departamentoCodigo: habilitacion.departamentoCodigo!,
      email: negocio.email,
      useAlegraCertificate: habilitacion.useAlegraCertificate,
      // El certificado propio se cargó y cifró en el Paso 1 (actualizarDatosNegocio) —
      // acá solo se descifra para el envío puntual a Alegra, nunca se persiste en claro.
      certificadoPfxBase64: habilitacion.useAlegraCertificate
        ? undefined
        : desencriptar(habilitacion.certificadoPfxCifrado!),
      certificadoPassword: habilitacion.useAlegraCertificate
        ? undefined
        : desencriptar(habilitacion.certificadoPasswordCifrado!),
    });

    habilitacion.alegraCompanyId = companyId;
    habilitacion.estado = EstadoHabilitacion.RESOLUCION_CARGADA;
    return this.habilitacionRepository.save(habilitacion);
  }

  /** Arma el objeto `resolution` de Alegra a partir de los datos de la resolución DIAN ya cargados. */
  private resolutionDesdeHabilitacion(habilitacion: HabilitacionFacturacionElectronica): ResolutionAlegra {
    return {
      prefix: habilitacion.resolucionPrefijo!,
      resolutionNumber: habilitacion.resolucionNumero!,
      startDate: habilitacion.resolucionFechaInicio!,
      endDate: habilitacion.resolucionFechaFin!,
      minNumber: habilitacion.resolucionRangoDesde!,
      maxNumber: habilitacion.resolucionRangoHasta!,
      technicalKey: habilitacion.resolucionTechnicalKey!,
    };
  }

  /**
   * La autorización de la DIAN tras crear el testset no es instantánea —
   * confirmado en vivo: la primera emisión inmediatamente después de
   * `crearTestSet` puede rechazar con "company is not authorized" aunque
   * unos segundos después ya figure autorizada. Sondea con backoff corto en
   * vez de asumir que el 200 de `crearTestSet` ya significa listo para emitir.
   */
  private async esperarAutorizacionGobierno(
    token: string,
    baseUrl: string,
    companyId: string,
    tipo: 'pos' | 'invoices',
  ): Promise<void> {
    const intentosMaximos = 5;
    for (let intento = 1; intento <= intentosMaximos; intento++) {
      const { posAutorizado } = await this.alegraClient.consultarCompania({ token, baseUrl, companyId, tipo });
      if (posAutorizado) return;
      if (intento < intentosMaximos) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error('La DIAN no autorizó la empresa a tiempo — intentá confirmar el testset de nuevo en un momento');
  }

  async confirmarTestSet(negocioId: string): Promise<HabilitacionFacturacionElectronica> {
    const habilitacion = await this.obtenerOCrearHabilitacion(negocioId);
    // ERROR es reintentable: la compañía ya se creó en Alegra (alegraCompanyId
    // seteado en cargarResolucion, Paso 3) antes de que este método pudiera
    // fallar — un reintento simplemente vuelve a correr el testset contra la
    // misma compañía, sin volver a pasar por el Paso 3.
    if (habilitacion.estado !== EstadoHabilitacion.RESOLUCION_CARGADA && habilitacion.estado !== EstadoHabilitacion.ERROR) {
      throw new BadRequestException('Completá primero la carga de la resolución (Paso 3)');
    }
    if (!habilitacion.governmentTestSetId) {
      throw new BadRequestException('Falta el TestSetId de la DIAN (Paso 3) — sin eso Alegra no puede activar el testset');
    }

    try {
      const token = process.env.ALEGRA_RESELLER_TOKEN!;
      const baseUrl = baseUrlPara(habilitacion.ambiente);

      try {
        await this.alegraClient.crearTestSet({
          token,
          baseUrl,
          companyId: habilitacion.alegraCompanyId!,
          // Factura Electrónica y Documento Equivalente POS son habilitaciones
          // DIAN independientes — como el sistema emite siempre Factura
          // (confirmado con el MCP de Alanube: `/equivalent-documents/pos` no
          // está en su catálogo curado), el testset tiene que habilitar
          // "invoices", no "pos".
          tipo: 'invoices',
          governmentId: habilitacion.governmentTestSetId,
        });
      } catch (error) {
        // Idempotencia real: un reintento tras timeout (Alegra recibió el alta
        // pero la respuesta no llegó) no debe tratarse como fallo — el testset
        // ya está aprobado, que es justo el estado que este paso busca lograr.
        const mensaje = error instanceof Error ? error.message : String(error);
        if (!mensaje.includes('already been approved')) throw error;
      }

      await this.esperarAutorizacionGobierno(token, baseUrl, habilitacion.alegraCompanyId!, 'invoices');

      const numeroInicial = habilitacion.siguienteNumero ?? habilitacion.resolucionRangoDesde!;
      const resolution = this.resolutionDesdeHabilitacion(habilitacion);
      const hoyISO = diaColombia();
      const customerPrueba: CustomerAlegra = { identificationNumber: '222222222222', identificationType: '13', name: 'Consumidor Final' };
      const itemPrueba: ItemFacturaAlegra = {
        description: 'Producto de prueba',
        quantity: 1,
        price: 10000,
        unitCode: '94',
        code: '999',
        subtotal: 10000,
        total: 10000,
        taxAmount: 0,
        taxes: [{ taxCode: '01', taxAmount: 0, taxPercentage: '0.00', taxableAmount: 10000 }],
      };
      const totalesPrueba: TotalAmountsFacturaAlegra = {
        grossTotal: 10000,
        taxableTotal: 10000,
        taxTotal: 0,
        payableTotal: 10000,
        discountTotal: 0,
        chargeTotal: 0,
        advanceTotal: 0,
      };
      const pagoPrueba: PaymentAlegra = {
        paymentForm: '1',
        paymentMethod: '10',
        paymentDueDate: diaColombia(),
      };

      // La DIAN exige, para habilitar Factura Electrónica específicamente,
      // 8 facturas + 1 nota crédito + 1 nota débito en el testset (guía
      // oficial de Alegra — distinto del conjunto de POS, 30+10, que es una
      // habilitación aparte). Numeración correlativa real dentro del rango.
      const CANTIDAD_FACTURAS_PRUEBA = 8;

      const facturas: { numero: number; fecha?: string; cufe?: string }[] = [];
      for (let i = 0; i < CANTIDAD_FACTURAS_PRUEBA; i++) {
        const numero = numeroInicial + i;
        const resultado = await this.alegraClient.crearFactura({
          token,
          baseUrl,
          companyId: habilitacion.alegraCompanyId!,
          number: numero,
          resolution,
          regimeCode: REGIME_CODE_RESPONSABLE_IVA,
          invoicePeriod: { startDate: hoyISO, endDate: hoyISO },
          customer: customerPrueba,
          items: [itemPrueba],
          payments: [pagoPrueba],
          totalAmounts: totalesPrueba,
        });
        facturas.push({ numero, fecha: resultado.fecha, cufe: resultado.cufe });
      }

      // Notas de ajuste (crédito/débito) referencian la primera factura del
      // conjunto — la DIAN solo exige que exista al menos una nota de cada
      // tipo en el testset, no una por documento.
      const documentoAsociado: DocumentoAsociadoAlegra = {
        prefix: resolution.prefix,
        number: facturas[0].numero,
        documentType: '01',
        date: (facturas[0].fecha ?? diaColombia()).slice(0, 10),
        uuid: facturas[0].cufe!,
      };

      await this.alegraClient.crearNotaCredito({
        token,
        baseUrl,
        companyId: habilitacion.alegraCompanyId!,
        number: numeroInicial + CANTIDAD_FACTURAS_PRUEBA,
        conceptCode: '2', // "Anulación de factura electrónica" (catálogo DIAN)
        documentoAsociado,
        regimeCode: REGIME_CODE_RESPONSABLE_IVA,
        invoicePeriod: { startDate: hoyISO, endDate: hoyISO },
        customer: customerPrueba,
        items: [itemPrueba],
        payments: [pagoPrueba],
        totalAmounts: totalesPrueba,
      });

      await this.alegraClient.crearNotaDebito({
        token,
        baseUrl,
        companyId: habilitacion.alegraCompanyId!,
        number: numeroInicial + CANTIDAD_FACTURAS_PRUEBA + 1,
        conceptCode: '4', // "Otros" (catálogo DIAN de conceptos de nota débito)
        documentoAsociado,
        regimeCode: REGIME_CODE_RESPONSABLE_IVA,
        invoicePeriod: { startDate: hoyISO, endDate: hoyISO },
        customer: customerPrueba,
        items: [itemPrueba],
        payments: [pagoPrueba],
        totalAmounts: totalesPrueba,
      });

      habilitacion.siguienteNumero = numeroInicial + CANTIDAD_FACTURAS_PRUEBA + 2;

      habilitacion.estado = EstadoHabilitacion.HABILITADO;
      if (!habilitacion.esHabilitacionDePrueba) {
        habilitacion.ambiente = 'PRODUCCION';
      }
      habilitacion.errorMensaje = undefined;
    } catch (error) {
      habilitacion.estado = EstadoHabilitacion.ERROR;
      habilitacion.errorMensaje = error instanceof Error ? error.message : String(error);
    }

    return this.habilitacionRepository.save(habilitacion);
  }

  /** Sale del modo sandbox de prueba: conserva razón social/NIT/dirección (Paso 1), limpia los campos de resolución de prueba para que el wizard de Paso 3 pida los reales. */
  async volverAModoReal(negocioId: string): Promise<HabilitacionFacturacionElectronica> {
    const habilitacion = await this.obtenerOCrearHabilitacion(negocioId);
    if (habilitacion.estado !== EstadoHabilitacion.HABILITADO || !habilitacion.esHabilitacionDePrueba) {
      throw new BadRequestException('Esta habilitación no está en modo sandbox de prueba');
    }
    habilitacion.esHabilitacionDePrueba = false;
    habilitacion.estado = EstadoHabilitacion.ESPERANDO_TRAMITE_DIAN;
    habilitacion.resolucionNumero = undefined;
    habilitacion.resolucionPrefijo = undefined;
    habilitacion.resolucionFechaInicio = undefined;
    habilitacion.resolucionFechaFin = undefined;
    habilitacion.resolucionRangoDesde = undefined;
    habilitacion.resolucionRangoHasta = undefined;
    habilitacion.resolucionTechnicalKey = undefined;
    habilitacion.governmentTestSetId = undefined;
    habilitacion.siguienteNumero = undefined;
    habilitacion.alegraCompanyId = undefined;
    return this.habilitacionRepository.save(habilitacion);
  }

  /**
   * Fail-closed: sin habilitación HABILITADO, no se crea nada — evita reintentos
   * infinitos contra un negocio que ni siquiera puede facturar todavía.
   * Se llama de forma NO bloqueante desde VentasService.crear() (ver Task 6) —
   * nunca debe lanzar una excepción que se propague hacia arriba, por eso el
   * try/catch de intentarEmitir envuelve toda la lógica real de red.
   */
  async emitirDocumento(
    venta: { id: string; negocioId: string; tipoComprobanteEmitido?: string },
    opciones: { talonario?: { numero: number; fecha: Date; periodoId: string } } = {},
  ): Promise<void> {
    // La política de facturación ya decidió el comprobante al crear la venta: solo una venta
    // FACTURA_ELECTRONICA lleva documento electrónico (un recibo nunca genera un segundo documento).
    if (venta.tipoComprobanteEmitido !== TipoComprobanteVenta.FACTURA_ELECTRONICA) return;

    const habilitacion = await this.habilitacionRepository.findOne({ where: { negocioId: venta.negocioId } });
    if (!habilitacion || habilitacion.estado !== EstadoHabilitacion.HABILITADO) return;

    // Fase 6a: factura de papel con numeración de contingencia — no se llama a Alegra ahora; se
    // transmite (documentType "04") cuando se cierra el período.
    if (opciones.talonario) {
      const { numero, fecha, periodoId } = opciones.talonario;
      await this.registrarDocumentoContingencia(venta.id, habilitacion, periodoId, numero, fecha, true);
      return;
    }
    const periodo = await this.contingencia.periodoActivo(venta.negocioId);
    if (periodo) {
      const { numero, habilitacion: conNumero } = await this.contingencia.asignarNumero(venta.negocioId);
      await this.registrarDocumentoContingencia(venta.id, conNumero, periodo.id, numero, new Date(), false);
      return;
    }

    const documento = this.documentosRepository.create({
      negocioId: venta.negocioId,
      ventaId: venta.id,
      // Siempre Factura Electrónica — Documento Equivalente POS no forma parte
      // del catálogo curado de Alanube (confirmado con el MCP oficial,
      // 2026-09-01). `tipo` se mantiene en el esquema solo para no perder el
      // registro de los documentos DEE_POS ya emitidos antes de este cambio.
      tipo: 'FACTURA',
      estado: EstadoDocumentoElectronico.PENDIENTE,
    });
    await this.documentosRepository.save(documento);

    await this.intentarEmitir(documento, habilitacion);
  }

  /**
   * `VentaItem.baseImponible`/`impuesto` ya vienen persistidos desde
   * `procesarItemsYStock` (congelados al momento de la venta) — no hace
   * falta cargar `items.producto` ni recalcular nada acá. `code` es un
   * string simple en `/invoices` (a diferencia del objeto
   * `{identificationId, id}` de `/equivalent-documents/pos`) — shape
   * confirmado con `validate_co_payload` del MCP de Alanube (2026-09-01).
   */
  private mapearItemsAlegra(venta: Venta): ItemFacturaAlegra[] {
    return venta.items.map((item) => {
      const baseImponible = Number(item.baseImponible);
      const impuesto = Number(item.impuesto);
      const pctImpuesto = baseImponible > 0 ? (impuesto / baseImponible) * 100 : 0;
      return {
        description: item.nombreProducto,
        quantity: Number(item.cantidad),
        price: Number(item.precioUnitario),
        // Catálogo UN/CEFACT de unidades de medida — "94" (unidad) confirmado en vivo.
        // El POS no trackea unidad de medida por producto hoy, así que se asume "unidad" siempre.
        unitCode: '94',
        // "999" = Estándar de adopción del contribuyente — único valor del catálogo
        // DIAN (001/010/020/999) que aplica sin un código GTIN/UNSPSC real por
        // producto, que el POS no trackea hoy.
        code: '999',
        subtotal: baseImponible,
        total: baseImponible + impuesto,
        taxAmount: impuesto,
        taxes: [{ taxCode: '01', taxAmount: impuesto, taxPercentage: pctImpuesto.toFixed(2), taxableAmount: baseImponible }],
      };
    });
  }

  /**
   * Identificador genérico DIAN de consumidor final ("222222222222") cuando
   * la venta no tiene `Cliente` con documento cargado — `/invoices` exige
   * `customer` siempre, a diferencia de DEE_POS. `identificationType: "13"`
   * (Cédula de ciudadanía) — confirmado en vivo: "43" (el valor documentado
   * para DEE_POS) no es parte del enum real de `/invoices`
   * (11/12/13/21/22/31/41/42/47/48/50/91), la DIAN lo rechaza con
   * "identificationType is not one of enum values".
   */
  private mapearCustomerAlegra(venta: Venta): CustomerAlegra {
    if (venta.cliente?.documentoIdentidad && venta.cliente.tipoDocumentoIdentidad) {
      const tipo = venta.cliente.tipoDocumentoIdentidad;
      if (tipo === '31') {
        // El usuario suele tipear el NIT con DV ("900.123.456-7"): el DV va aparte, en `dv`.
        const nit = limpiarNit(venta.cliente.documentoIdentidad.split('-')[0]);
        return {
          identificationNumber: nit,
          identificationType: tipo,
          dv: calcularDigitoVerificacion(nit),
          organizationType: 1,
          name: venta.cliente.nombre,
        };
      }
      return {
        identificationNumber: venta.cliente.documentoIdentidad.trim(),
        identificationType: tipo,
        name: venta.cliente.nombre,
      };
    }
    return { identificationNumber: '222222222222', identificationType: '13', name: 'Consumidor Final' };
  }

  private mapearTotalesAlegra(venta: Venta): TotalAmountsFacturaAlegra {
    const subtotal = Number(venta.subtotal);
    const descuentoTotal = Number(venta.descuentoTotal);
    const impuestoTotal = Number(venta.impuestoTotal);
    return {
      grossTotal: subtotal,
      taxableTotal: subtotal - descuentoTotal,
      taxTotal: impuestoTotal,
      payableTotal: Number(venta.total),
      discountTotal: descuentoTotal,
      chargeTotal: 0,
      advanceTotal: 0,
    };
  }

  /**
   * Catálogo DIAN de medios de pago (10 efectivo, 49 tarjeta débito, 45
   * transferencia crédito bancario) — mapeo por nombre porque `VentaPago.metodoPago`
   * es texto libre igual al `MetodoPago.nombre` del negocio, sin un código DIAN
   * asociado. Nequi/Daviplata/Otro no tienen un código de billetera digital claro
   * en el catálogo público, así que caen en "1" (instrumento no definido) — punto
   * a revisar si algún negocio real termina necesitando el código exacto.
   */
  private codigoMedioPagoDian(metodoPago: string): string {
    const nombre = metodoPago.toLowerCase();
    if (nombre.includes('efectivo')) return '10';
    if (nombre.includes('tarjeta')) return '49';
    if (nombre.includes('transferencia')) return '45';
    return '1';
  }

  private mapearPagosAlegra(venta: Venta): PaymentAlegra[] {
    // Crédito (Conceptos DIAN 974 y 5480 de 2025): la factura sale al vender y vence con la última
    // cuota. Una venta a crédito no tiene `VentaPago` (se paga con abonos), así que se manda un solo
    // pago de crédito — `payments` es obligatorio y, con forma 2, también `paymentDueDate`. Medio
    // "1" (instrumento no definido): al vender todavía no se sabe cómo pagará cada cuota.
    if (venta.tipoVenta === 'CREDITO') {
      const vencimientos = (venta.cuotas ?? []).map((c) => c.fechaVencimiento).sort();
      return [{ paymentForm: '2', paymentMethod: '1', paymentDueDate: vencimientos.at(-1) ?? diaColombia() }];
    }
    // Contado: DIAN exige una fecha de vencimiento del pago aunque no aplique — la de hoy.
    const fechaVencimiento = diaColombia();
    return (venta.pagos ?? []).map((pago) => ({
      paymentForm: '1',
      paymentMethod: this.codigoMedioPagoDian(pago.metodoPago),
      paymentDueDate: fechaVencimiento,
    }));
  }

  /** Compartido entre la emisión inicial (arriba) y el cron de reintento (Task 7). */
  async intentarEmitir(
    documento: DocumentoElectronico,
    habilitacion: HabilitacionFacturacionElectronica,
  ): Promise<void> {
    if (documento.periodoContingenciaId) return this.transmitirContingencia(documento, habilitacion);
    const token = process.env.ALEGRA_RESELLER_TOKEN!;
    const baseUrl = baseUrlPara(habilitacion.ambiente);

    documento.intentos += 1;
    documento.ultimoIntentoEn = new Date();

    // Numeración correlativa real dentro del rango de la resolución — nunca el
    // contador de reintentos (documento.intentos), que solo mide llamadas de red.
    const numero = habilitacion.siguienteNumero ?? habilitacion.resolucionRangoDesde ?? 1;

    try {
      const venta = await this.ventasRepository.findOneOrFail({
        where: { id: documento.ventaId },
        relations: { items: true, pagos: true, cliente: true, cuotas: true },
      });
      const negocio = await this.negociosRepository.findOneOrFail({ where: { id: documento.negocioId } });
      const resolution = this.resolutionDesdeHabilitacion(habilitacion);
      const items = this.mapearItemsAlegra(venta);
      const totalAmounts = this.mapearTotalesAlegra(venta);
      const payments = this.mapearPagosAlegra(venta);
      const customer = this.mapearCustomerAlegra(venta);

      const resultado = await this.alegraClient.crearFactura({
        token,
        baseUrl,
        companyId: habilitacion.alegraCompanyId!,
        number: numero,
        regimeCode: REGIME_CODE_RESPONSABLE_IVA,
        invoicePeriod: { startDate: diaColombia(), endDate: diaColombia() },
        resolution,
        customer,
        items,
        payments,
        totalAmounts,
      });

      documento.alegraDocumentId = resultado.alegraDocumentId;
      this.congelarDatosEmision(documento, habilitacion, negocio, venta, numero);
      this.aplicarDatosAlegra(documento, resultado);
      // El envío llegó bien a Alegra (no lanzó) — cualquier errorMensaje de un
      // intento anterior fallido ya no aplica, se limpia salvo que la DIAN
      // rechace este intento con un motivo real (ver abajo).
      documento.errorMensaje = undefined;
      documento.erroresDetalle = null;
      this.aplicarEstadoEmision(documento, resultado);

      // Alegra respondió: se corta la racha de indisponibilidad (fase 6a). Antes del save de abajo,
      // que guarda la misma entidad con los dos cambios.
      await this.contingencia.registrarDisponibilidad(habilitacion);
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
      // Solo la indisponibilidad (no un rechazo ni un 4xx) cuenta para la contingencia automática.
      if (error instanceof AlegraNoDisponibleError) {
        await this.contingencia
          .registrarIndisponibilidad(habilitacion)
          .catch((e: unknown) =>
            this.logger.error('No se pudo registrar la indisponibilidad de Alegra', e instanceof Error ? e.stack : String(e)),
          );
      }
    }

    await this.documentosRepository.save(documento);
    this.realtimeGateway.emitToNegocio(documento.negocioId, 'documentos-electronicos:cambio', documento);

    if (
      (documento.estado === EstadoDocumentoElectronico.ACEPTADO ||
        documento.estado === EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES) &&
      habilitacion.ambiente === 'PRODUCCION'
    ) {
      await this.suscripcionesService.registrarConsumo(documento.negocioId, 'documentosDianPorMes');
    }
  }

  /** Estado del documento según la respuesta de Alegra — compartido por la emisión normal y la de contingencia. */
  private aplicarEstadoEmision(
    documento: DocumentoElectronico,
    resultado: {
      isFinal: boolean;
      legalStatus?: string;
      trackingReference?: Record<string, unknown>;
      governmentResponseMessage?: string;
      errorMessages?: string[];
    },
  ): void {
    if (!resultado.isFinal) {
      // DIAN intermitente — no reenviar en el próximo ciclo, `reconciliarPendientes`
      // consulta el `trackingReference` guardado en vez de reintentar el envío.
      documento.trackingReference = resultado.trackingReference ?? null;
      documento.estado = EstadoDocumentoElectronico.PENDIENTE;
    } else if (resultado.legalStatus === 'ACCEPTED') {
      documento.estado = EstadoDocumentoElectronico.ACEPTADO;
    } else if (resultado.legalStatus === 'ACCEPTED_WITH_OBSERVATIONS') {
      documento.estado = EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES;
      documento.erroresDetalle = resultado.errorMessages ?? null;
    } else if (resultado.legalStatus === 'REJECTED') {
      documento.estado = EstadoDocumentoElectronico.RECHAZADO;
      documento.errorMensaje = resultado.governmentResponseMessage;
      documento.erroresDetalle = resultado.errorMessages ?? null;
    }
  }

  /**
   * Transcripción de una factura de papel (factura tipo 03 de la DIAN = `documentType "04"` en Alegra).
   * Número y resolución salen del snapshot del documento (los del papel entregado), nunca de la habilitación
   * actual; `fechaEmision` sigue siendo la del papel. No avanza el consecutivo de la factura electrónica.
   */
  private async transmitirContingencia(
    documento: DocumentoElectronico,
    habilitacion: HabilitacionFacturacionElectronica,
  ): Promise<void> {
    documento.intentos += 1;
    documento.ultimoIntentoEn = new Date();
    try {
      const venta = await this.ventasRepository.findOneOrFail({
        where: { id: documento.ventaId },
        relations: { items: true, pagos: true, cliente: true, cuotas: true },
      });
      const diaPapel = diaColombia(documento.fechaEmision!);
      const resultado = await this.alegraClient.crearFactura({
        token: process.env.ALEGRA_RESELLER_TOKEN!,
        baseUrl: baseUrlPara(habilitacion.ambiente),
        companyId: habilitacion.alegraCompanyId!,
        documentType: DOCUMENT_TYPE_CONTINGENCIA_FACTURADOR,
        number: documento.numero!,
        additionalDocumentReference: { number: documento.numeroCompleto!, issueDate: diaPapel },
        regimeCode: REGIME_CODE_RESPONSABLE_IVA,
        invoicePeriod: { startDate: diaPapel, endDate: diaPapel },
        resolution: resolucionContingenciaDesdeDocumento(documento),
        customer: this.mapearCustomerAlegra(venta),
        items: this.mapearItemsAlegra(venta),
        payments: this.mapearPagosAlegra(venta),
        totalAmounts: this.mapearTotalesAlegra(venta),
      });
      documento.alegraDocumentId = resultado.alegraDocumentId;
      // Sin `fecha`: la de la factura de papel no se pisa con la de transmisión.
      this.aplicarDatosAlegra(documento, { ...resultado, fecha: undefined });
      documento.errorMensaje = undefined;
      documento.erroresDetalle = null;
      this.aplicarEstadoEmision(documento, resultado);
    } catch (error) {
      documento.errorMensaje = error instanceof Error ? error.message : String(error);
    }
    await this.documentosRepository.save(documento);
    this.realtimeGateway.emitToNegocio(documento.negocioId, 'documentos-electronicos:cambio', documento);
    if (
      (documento.estado === EstadoDocumentoElectronico.ACEPTADO ||
        documento.estado === EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES) &&
      habilitacion.ambiente === 'PRODUCCION'
    ) {
      await this.suscripcionesService.registrarConsumo(documento.negocioId, 'documentosDianPorMes');
    }
  }

  /** Cron: un período AUTOMATICO se cierra solo cuando Alegra vuelve a responder (los MANUAL los cierra el administrador). */
  async verificarFinContingenciasAutomaticas(): Promise<void> {
    for (const periodo of await this.contingencia.periodosAutomaticosAbiertos()) {
      const habilitacion = await this.habilitacionRepository.findOne({ where: { negocioId: periodo.negocioId } });
      if (!habilitacion?.alegraCompanyId) continue;
      try {
        await this.alegraClient.consultarCompania({
          token: process.env.ALEGRA_RESELLER_TOKEN!,
          baseUrl: baseUrlPara(habilitacion.ambiente),
          companyId: habilitacion.alegraCompanyId,
          tipo: 'invoices',
        });
      } catch {
        continue; // sigue caído
      }
      await this.contingencia.finalizar(periodo.negocioId, null);
    }
  }

  async procesarWebhookAlegra(payload: { documentId?: string; status?: string; legalStatus?: string }): Promise<void> {
    if (!payload?.documentId) return;
    const documento = await this.documentosRepository.findOne({ where: { alegraDocumentId: payload.documentId } });
    if (!documento || documento.estado !== EstadoDocumentoElectronico.PENDIENTE) return;
    // Sandbox de prueba no descuenta cupo — ver FacturacionElectronicaService.activarModoSandboxDePrueba.
    const habilitacion = await this.habilitacionRepository.findOne({ where: { negocioId: documento.negocioId } });

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
    this.realtimeGateway.emitToNegocio(documento.negocioId, 'documentos-electronicos:cambio', documento);

    if (
      (documento.estado === EstadoDocumentoElectronico.ACEPTADO ||
        documento.estado === EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES) &&
      habilitacion?.ambiente === 'PRODUCCION'
    ) {
      await this.suscripcionesService.registrarConsumo(documento.negocioId, 'documentosDianPorMes');
    }
  }

  /** Backoff simple: reintenta/consulta cada documento PENDIENTE que no se tocó en los últimos 5 minutos. */
  async reconciliarPendientes(): Promise<void> {
    const haceCincoMin = new Date(Date.now() - 5 * 60 * 1000);
    const pendientes = await this.documentosRepository.find({ where: { estado: EstadoDocumentoElectronico.PENDIENTE } });

    for (const documento of pendientes) {
      if (documento.ultimoIntentoEn && documento.ultimoIntentoEn > haceCincoMin) continue;
      const habilitacion = await this.habilitacionRepository.findOne({ where: { negocioId: documento.negocioId } });
      if (!habilitacion || habilitacion.estado !== EstadoHabilitacion.HABILITADO) continue;
      // Fase 6a: la transcripción se transmite recién cuando se supera el inconveniente (período cerrado).
      if (documento.periodoContingenciaId && (await this.contingencia.estaAbierto(documento.periodoContingenciaId))) {
        continue;
      }

      if (documento.trackingReference) {
        await this.consultarPendiente(documento, habilitacion);
      } else {
        await this.intentarEmitir(documento, habilitacion);
      }
    }
  }

  /** Resuelve un documento que quedó `isFinal: false` — nunca reenvía, solo consulta el resultado ya en curso ante la DIAN. */
  private async consultarPendiente(
    documento: DocumentoElectronico,
    habilitacion: HabilitacionFacturacionElectronica,
  ): Promise<void> {
    const token = process.env.ALEGRA_RESELLER_TOKEN!;
    const baseUrl = baseUrlPara(habilitacion.ambiente);
    const trackingReference = documento.trackingReference as { documentId: string };

    documento.ultimoIntentoEn = new Date();
    try {
      const resultado = await this.alegraClient.consultarFactura({ token, baseUrl, documentId: trackingReference.documentId });
      if (!resultado.isFinal) {
        await this.documentosRepository.save(documento);
        return;
      }
      documento.trackingReference = null;
      this.aplicarDatosAlegra(documento, resultado);
      if (resultado.legalStatus === 'ACCEPTED') {
        documento.estado = EstadoDocumentoElectronico.ACEPTADO;
      } else if (resultado.legalStatus === 'ACCEPTED_WITH_OBSERVATIONS') {
        documento.estado = EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES;
        documento.erroresDetalle = resultado.errorMessages ?? null;
      } else if (resultado.legalStatus === 'REJECTED') {
        documento.estado = EstadoDocumentoElectronico.RECHAZADO;
        documento.errorMensaje = resultado.governmentResponseMessage;
        documento.erroresDetalle = resultado.errorMessages ?? null;
      }
    } catch (error) {
      documento.errorMensaje = error instanceof Error ? error.message : String(error);
    }
    await this.documentosRepository.save(documento);
    this.realtimeGateway.emitToNegocio(documento.negocioId, 'documentos-electronicos:cambio', documento);

    if (
      (documento.estado === EstadoDocumentoElectronico.ACEPTADO || documento.estado === EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES) &&
      habilitacion.ambiente === 'PRODUCCION'
    ) {
      await this.suscripcionesService.registrarConsumo(documento.negocioId, 'documentosDianPorMes');
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
      // Los de contingencia tienen su propio plazo (48 h desde el fin del período): ContingenciaService.alertarPlazos.
      .andWhere('doc.periodo_contingencia_id IS NULL')
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

  /**
   * Siempre filtra por `negocioId` además de `ventaId` — este servicio usa el
   * repositorio directo (no `TenantBaseService`), así que sin este filtro un
   * usuario de otro negocio podía leer/reintentar/descargar documentos ajenos
   * conociendo el id de la venta. Un documento de otro negocio responde igual
   * que uno inexistente (null / 404), sin revelar que existe.
   */
  async obtenerDocumentoPorVenta(ventaId: string, negocioId: string): Promise<DocumentoElectronico | null> {
    return this.documentosRepository.findOne({ where: { ventaId, negocioId } });
  }

  private async documentoDelNegocioOFallar(ventaId: string, negocioId: string): Promise<DocumentoElectronico> {
    const documento = await this.obtenerDocumentoPorVenta(ventaId, negocioId);
    if (!documento) throw new NotFoundException('Documento electrónico no encontrado');
    return documento;
  }

  async reintentarPorVenta(ventaId: string, negocioId: string): Promise<DocumentoElectronico> {
    const documento = await this.documentoDelNegocioOFallar(ventaId, negocioId);
    await this.exigirReintentable(documento);
    const habilitacion = await this.habilitacionRepository.findOneOrFail({ where: { negocioId: documento.negocioId } });
    await this.intentarEmitir(documento, habilitacion);
    return this.documentoDelNegocioOFallar(ventaId, negocioId);
  }

  async listarFacturas(negocioId: string, filtros: FiltrosFacturasDto): Promise<ListadoFacturas> {
    const pagina = filtros.pagina ?? 1;
    const porPagina = filtros.porPagina ?? 20;

    // Negocio + fechas + búsqueda aplican a la tabla Y al resumen; el filtro de estado solo a la tabla
    // (el resumen es justamente lo que se usa para elegir ese filtro).
    // La tabla muestra la fecha de emisión (o la de creación si nunca se emitió) — filtrar y ordenar por
    // `createdAt` a secas no coincidía: un reintento reusa el documento con su `createdAt` original.
    const fecha = 'COALESCE(doc.fechaEmision, doc.createdAt)';
    const base = () => {
      const qb = this.documentosRepository.createQueryBuilder('doc').where('doc.negocioId = :negocioId', { negocioId });
      if (filtros.desde) qb.andWhere(`${fecha} >= :desde`, { desde: inicioDiaColombia(filtros.desde) });
      if (filtros.hasta) qb.andWhere(`${fecha} <= :hasta`, { hasta: finDiaColombia(filtros.hasta) });
      const q = filtros.q?.trim();
      if (q) qb.andWhere('(doc.numeroCompleto ILIKE :q OR doc.nombreCliente ILIKE :q)', { q: `%${q}%` });
      return qb;
    };

    const listado = base();
    if (filtros.estado) listado.andWhere('doc.estado = :estado', { estado: filtros.estado });
    const [items, total] = await listado
      .orderBy(fecha, 'DESC')
      .offset((pagina - 1) * porPagina)
      .limit(porPagina)
      .getManyAndCount();

    const conteos = await base()
      .select('doc.estado', 'estado')
      .addSelect('COUNT(*)', 'cantidad')
      .groupBy('doc.estado')
      .getRawMany<{ estado: EstadoDocumentoElectronico; cantidad: string }>();
    const cantidad = (...estados: EstadoDocumentoElectronico[]) =>
      conteos.filter((c) => estados.includes(c.estado)).reduce((suma, c) => suma + Number(c.cantidad), 0);

    return {
      items,
      total,
      pagina,
      porPagina,
      resumen: {
        aceptados: cantidad(EstadoDocumentoElectronico.ACEPTADO, EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES),
        pendientes: cantidad(EstadoDocumentoElectronico.PENDIENTE, EstadoDocumentoElectronico.ERROR),
        rechazados: cantidad(EstadoDocumentoElectronico.RECHAZADO),
      },
      tieneLogo: (await this.logoNegocio.resolverLogo(negocioId)) !== null,
    };
  }

  async obtenerFactura(
    id: string,
    negocioId: string,
  ): Promise<{ documento: DocumentoElectronico; venta: Venta | null; qrDataUrl: string | null }> {
    const documento = await this.facturaDelNegocioOFallar(id, negocioId);
    try {
      await this.completarDatosFaltantes(documento);
    } catch (error) {
      // El detalle no depende de Alegra — se muestra con lo que haya (spec, sección 7).
      this.logger.warn(`No se pudo completar el snapshot de ${documento.id}: ${(error as Error).message}`);
    }
    const venta = await this.ventasRepository.findOne({
      where: { id: documento.ventaId, negocioId },
      relations: { items: true, pagos: true, cliente: true },
    });
    const qrDataUrl = documento.qrContenido ? await this.facturaPdf.generarQrDataUrl(documento.qrContenido) : null;
    return { documento, venta, qrDataUrl };
  }

  async generarPdf(id: string, negocioId: string): Promise<{ nombreArchivo: string; contenido: Buffer }> {
    const documento = await this.facturaDelNegocioOFallar(id, negocioId);
    if (documento.tipo !== 'FACTURA') {
      throw new ConflictException('Documento legado sin representación gráfica disponible');
    }
    if (!documento.cufe || !documento.alegraDocumentId) {
      throw new ConflictException('Esperando respuesta de la DIAN');
    }
    // Si Alegra falla acá sube como BadGateway (502) — sin QR no hay PDF válido.
    await this.completarDatosFaltantes(documento);
    if (!documento.qrContenido) throw new ConflictException('Esperando respuesta de la DIAN');

    const venta = await this.ventasRepository.findOneOrFail({
      where: { id: documento.ventaId, negocioId },
      relations: { items: true, pagos: true, cliente: true },
    });
    const logo = await this.logoNegocio.resolverLogo(negocioId);
    const contenido = await this.facturaPdf.generar({ documento, venta, logo });
    return { nombreArchivo: `${documento.numeroCompleto ?? documento.id}.pdf`, contenido };
  }

  async descargarXml(id: string, negocioId: string): Promise<{ nombreArchivo: string; contenido: Buffer }> {
    const documento = await this.facturaDelNegocioOFallar(id, negocioId);
    if (!documento.alegraDocumentId) throw new ConflictException('Esta factura todavía no llegó a Alegra');
    const habilitacion = await this.habilitacionRepository.findOneOrFail({ where: { negocioId } });
    const token = process.env.ALEGRA_RESELLER_TOKEN!;
    const baseUrl = baseUrlPara(habilitacion.ambiente);

    const { urlXml } =
      documento.tipo === 'FACTURA'
        ? await this.alegraClient.consultarFactura({ token, baseUrl, documentId: documento.alegraDocumentId })
        : await this.alegraClient.consultarDocumento({
            token,
            baseUrl,
            alegraDocumentId: documento.alegraDocumentId,
            tipo: documento.tipo,
          });
    if (!urlXml) throw new BadGatewayException('Alegra no devolvió el XML de esta factura');

    // La URL es un link de S3 prefirmado (expira en 1h) — se descarga acá y nunca llega al navegador.
    const res = await fetch(urlXml);
    if (!res.ok) throw new BadGatewayException('No se pudo obtener el documento de Alegra, intentá en unos minutos');
    return {
      nombreArchivo: `${documento.numeroCompleto ?? documento.id}.xml`,
      contenido: Buffer.from(await res.arrayBuffer()),
    };
  }

  async reintentarFactura(id: string, negocioId: string): Promise<DocumentoElectronico> {
    const documento = await this.facturaDelNegocioOFallar(id, negocioId);
    await this.exigirReintentable(documento);
    const habilitacion = await this.habilitacionRepository.findOneOrFail({ where: { negocioId } });
    await this.intentarEmitir(documento, habilitacion);
    return this.facturaDelNegocioOFallar(id, negocioId);
  }

  async resumenPorVentas(
    negocioId: string,
    ventaIds: string[],
  ): Promise<Map<string, { id: string; estado: EstadoDocumentoElectronico }>> {
    if (ventaIds.length === 0) return new Map();
    const documentos = await this.documentosRepository.find({
      where: { negocioId, ventaId: In(ventaIds) },
      select: { id: true, ventaId: true, estado: true },
    });
    return new Map(documentos.map((d) => [d.ventaId, { id: d.id, estado: d.estado }]));
  }

  private async facturaDelNegocioOFallar(id: string, negocioId: string): Promise<DocumentoElectronico> {
    const documento = await this.documentosRepository.findOne({ where: { id, negocioId } });
    if (!documento) throw new NotFoundException('Factura electrónica no encontrada');
    return documento;
  }

  /**
   * Reintentar un documento ya aceptado (o todavía en curso ante la DIAN) emitiría una SEGUNDA
   * factura real con un número nuevo para la misma venta. Solo se reintenta lo rechazado o lo
   * que nunca llegó a Alegra (pendiente sin `trackingReference`).
   */
  private async exigirReintentable(documento: DocumentoElectronico): Promise<void> {
    if (documento.periodoContingenciaId && (await this.contingencia.estaAbierto(documento.periodoContingenciaId))) {
      throw new BadRequestException('La contingencia sigue abierta: esta factura se transmite al terminarla');
    }
    const reintentable =
      documento.estado === EstadoDocumentoElectronico.RECHAZADO ||
      documento.estado === EstadoDocumentoElectronico.ERROR ||
      (documento.estado === EstadoDocumentoElectronico.PENDIENTE && !documento.trackingReference);
    if (!reintentable) throw new BadRequestException('Esta factura no se puede reintentar');
  }

  /**
   * Backfill perezoso (spec 3.2) para documentos emitidos antes del snapshot: consulta Alegra
   * una sola vez y guarda. La resolución/emisor se toman de la habilitación actual — mejor
   * aproximación posible para documentos viejos; los nuevos quedan exactos desde la emisión.
   */
  private async completarDatosFaltantes(documento: DocumentoElectronico): Promise<void> {
    if (documento.numeroCompleto || !documento.alegraDocumentId || documento.tipo !== 'FACTURA') return;
    const habilitacion = await this.habilitacionRepository.findOneOrFail({ where: { negocioId: documento.negocioId } });
    const negocio = await this.negociosRepository.findOneOrFail({ where: { id: documento.negocioId } });
    const venta = await this.ventasRepository.findOneOrFail({ where: { id: documento.ventaId } });
    const resultado = await this.alegraClient.consultarFactura({
      token: process.env.ALEGRA_RESELLER_TOKEN!,
      baseUrl: baseUrlPara(habilitacion.ambiente),
      documentId: documento.alegraDocumentId,
    });
    this.congelarDatosEmision(documento, habilitacion, negocio, venta, resultado.number ?? documento.numero ?? 0);
    this.aplicarDatosAlegra(documento, resultado);
    await this.documentosRepository.save(documento);
  }

  /**
   * Foto de la resolución, el emisor y la venta al momento de emitir (spec 2026-09-28, 3.1) —
   * la habilitación es mutable, y si el negocio renueva su resolución, el PDF de una factura
   * vieja no puede cambiar.
   */
  private congelarDatosEmision(
    documento: DocumentoElectronico,
    habilitacion: HabilitacionFacturacionElectronica,
    negocio: Negocio,
    venta: Venta,
    numero: number,
  ): void {
    documento.numero = numero;
    documento.prefijo = habilitacion.resolucionPrefijo;
    documento.numeroCompleto = `${habilitacion.resolucionPrefijo ?? ''}${numero}`;
    documento.ambiente = habilitacion.ambiente;
    documento.resolucionNumero = habilitacion.resolucionNumero;
    documento.resolucionFechaInicio = habilitacion.resolucionFechaInicio;
    documento.resolucionFechaFin = habilitacion.resolucionFechaFin;
    documento.resolucionRangoDesde = habilitacion.resolucionRangoDesde;
    documento.resolucionRangoHasta = habilitacion.resolucionRangoHasta;
    documento.emisorRazonSocial = habilitacion.razonSocial ?? negocio.nombre;
    documento.emisorNit = negocio.nit;
    documento.emisorDireccion = habilitacion.direccion ?? negocio.direccion;
    documento.emisorCiudad = habilitacion.ciudad ?? negocio.ciudadNombre;
    documento.nombreCliente = venta.nombreCliente;
    documento.total = Number(venta.total);
  }

  /** Factura de talonario o de papel (Res. 000227, art. 1.5.1.2.2.2): snapshot con la resolución de contingencia y QR provisional. */
  private async registrarDocumentoContingencia(
    ventaId: string,
    habilitacion: HabilitacionFacturacionElectronica,
    periodoId: string,
    numero: number,
    fecha: Date,
    transcritaDeTalonario: boolean,
  ): Promise<void> {
    const venta = await this.ventasRepository.findOneOrFail({ where: { id: ventaId }, relations: { cliente: true } });
    const negocio = await this.negociosRepository.findOneOrFail({ where: { id: venta.negocioId } });
    const documento = this.documentosRepository.create({
      negocioId: venta.negocioId,
      ventaId: venta.id,
      tipo: 'FACTURA',
      estado: EstadoDocumentoElectronico.PENDIENTE,
      periodoContingenciaId: periodoId,
      transcritaDeTalonario,
    });
    // El emisor es siempre el negocio (congelarDatosEmision); solo la resolución se reemplaza por la de contingencia.
    this.congelarDatosEmision(documento, habilitacion, negocio, venta, numero);
    documento.prefijo = habilitacion.contingenciaPrefijo ?? undefined;
    documento.numeroCompleto = `${habilitacion.contingenciaPrefijo ?? ''}${numero}`;
    documento.resolucionNumero = habilitacion.contingenciaResolucionNumero ?? undefined;
    documento.resolucionFechaInicio = habilitacion.contingenciaFechaInicio ?? undefined;
    documento.resolucionFechaFin = habilitacion.contingenciaFechaFin ?? undefined;
    documento.resolucionRangoDesde = habilitacion.contingenciaRangoDesde ?? undefined;
    documento.resolucionRangoHasta = habilitacion.contingenciaRangoHasta ?? undefined;
    documento.fechaEmision = fecha;
    documento.qrContenido = contenidoQrContingencia({
      numeroCompleto: documento.numeroCompleto,
      fecha,
      nitEmisor: negocio.nit ?? '',
      documentoAdquirente: this.mapearCustomerAlegra(venta).identificationNumber,
      subtotal: Number(venta.subtotal) - Number(venta.descuentoTotal ?? 0),
      iva: Number(venta.impuestoTotal),
      total: Number(venta.total),
    });
    const guardado = await this.documentosRepository.save(documento);
    this.realtimeGateway.emitToNegocio(guardado.negocioId, 'documentos-electronicos:cambio', guardado);
  }

  /** Lo que Alegra confirma pisa lo calculado localmente (ej. `fullNumber` real vs. prefijo+número armado a mano). */
  private aplicarDatosAlegra(documento: DocumentoElectronico, resultado: DatosAlegraFactura): void {
    if (resultado.cufe) documento.cufe = resultado.cufe;
    if (resultado.fullNumber) documento.numeroCompleto = resultado.fullNumber;
    if (resultado.prefix) documento.prefijo = resultado.prefix;
    if (resultado.number !== undefined) documento.numero = resultado.number;
    if (resultado.fecha) documento.fechaEmision = new Date(resultado.fecha);
    if (resultado.qrCodeContent) documento.qrContenido = resultado.qrCodeContent;
  }
}
