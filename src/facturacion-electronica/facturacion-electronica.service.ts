import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HabilitacionFacturacionElectronica } from './entities/habilitacion-facturacion-electronica.entity';
import { DocumentoElectronico } from './entities/documento-electronico.entity';
import { EstadoHabilitacion } from './entities/estado-habilitacion.enum';
import { EstadoDocumentoElectronico } from './entities/estado-documento-electronico.enum';
import {
  AlegraClientService,
  CustomerAlegra,
  DocumentoAsociadoAlegra,
  ItemFacturaAlegra,
  PaymentAlegra,
  ResolutionAlegra,
  TotalAmountsFacturaAlegra,
} from './alegra-client.service';
import { ActualizarDatosNegocioDto } from './dto/actualizar-datos-negocio.dto';
import { CargarResolucionDto } from './dto/cargar-resolucion.dto';
import { encriptar, desencriptar } from '../common/utils/cifrado';
import { Negocio } from '../negocios/entities/negocio.entity';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';
import { Alerta } from '../alertas/entities/alerta.entity';
import { TipoAlerta, SeveridadAlerta } from '../common/enums/alerta.enum';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Venta } from '../ventas/entities/venta.entity';
import { calcularDigitoVerificacion, limpiarNit } from '../common/utils/nit';

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
    @InjectRepository(Venta)
    private readonly ventasRepository: Repository<Venta>,
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
      const hoyISO = new Date().toISOString().slice(0, 10);
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
        paymentDueDate: new Date().toISOString().slice(0, 10),
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
        date: (facturas[0].fecha ?? new Date().toISOString()).slice(0, 10),
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
      return {
        identificationNumber: venta.cliente.documentoIdentidad,
        identificationType: venta.cliente.tipoDocumentoIdentidad,
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
    // DIAN exige una fecha de vencimiento del pago — para CONTADO no aplica
    // realmente, así que se usa la fecha de hoy. CREDITO sí tiene cuotas con
    // fecha propia (`Cuota.fechaVencimiento`) que esto todavía no está usando
    // (mapeo simplificado, ver nota de la clase).
    const fechaVencimiento = new Date().toISOString().slice(0, 10);
    return (venta.pagos ?? []).map((pago) => ({
      paymentForm: venta.tipoVenta === 'CREDITO' ? '2' : '1',
      paymentMethod: this.codigoMedioPagoDian(pago.metodoPago),
      paymentDueDate: fechaVencimiento,
    }));
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
      const venta = await this.ventasRepository.findOneOrFail({
        where: { id: documento.ventaId },
        relations: { items: true, pagos: true, cliente: true },
      });
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
        invoicePeriod: { startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10) },
        resolution,
        customer,
        items,
        payments,
        totalAmounts,
      });

      documento.alegraDocumentId = resultado.alegraDocumentId;
      if (resultado.cufe) documento.cufe = resultado.cufe;
      // El envío llegó bien a Alegra (no lanzó) — cualquier errorMensaje de un
      // intento anterior fallido ya no aplica, se limpia salvo que la DIAN
      // rechace este intento con un motivo real (ver abajo).
      documento.errorMensaje = undefined;
      documento.erroresDetalle = null;

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
    this.realtimeGateway.emitToNegocio(documento.negocioId, 'documentos-electronicos:cambio', documento);

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
    this.realtimeGateway.emitToNegocio(documento.negocioId, 'documentos-electronicos:cambio', documento);

    if (
      documento.estado === EstadoDocumentoElectronico.ACEPTADO ||
      documento.estado === EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES
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
      if (resultado.cufe) documento.cufe = resultado.cufe;
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

    if (documento.estado === EstadoDocumentoElectronico.ACEPTADO || documento.estado === EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES) {
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

  async obtenerDocumentoPorVenta(ventaId: string): Promise<DocumentoElectronico | null> {
    return this.documentosRepository.findOne({ where: { ventaId } });
  }

  async reintentarPorVenta(ventaId: string): Promise<DocumentoElectronico> {
    const documento = await this.documentosRepository.findOneOrFail({ where: { ventaId } });
    const habilitacion = await this.habilitacionRepository.findOneOrFail({ where: { negocioId: documento.negocioId } });
    await this.intentarEmitir(documento, habilitacion);
    return this.documentosRepository.findOneOrFail({ where: { ventaId } });
  }

  async obtenerLinksDescarga(ventaId: string): Promise<{ urlXml?: string; urlPdf?: string }> {
    const documento = await this.documentosRepository.findOneOrFail({ where: { ventaId } });
    if (!documento.alegraDocumentId) return {};
    const habilitacion = await this.habilitacionRepository.findOneOrFail({ where: { negocioId: documento.negocioId } });
    const token = process.env.ALEGRA_RESELLER_TOKEN!;
    const baseUrl = baseUrlPara(habilitacion.ambiente);

    // Documentos nuevos son siempre FACTURA — usan `/invoices/{id}`, con `pdf`
    // disponible (DEE_POS legado, `consultarDocumento`, nunca lo confirmó).
    if (documento.tipo === 'FACTURA') {
      const resultado = await this.alegraClient.consultarFactura({ token, baseUrl, documentId: documento.alegraDocumentId });
      return { urlXml: resultado.urlXml, urlPdf: resultado.urlPdf };
    }
    const resultado = await this.alegraClient.consultarDocumento({
      token,
      baseUrl,
      alegraDocumentId: documento.alegraDocumentId,
      tipo: documento.tipo,
    });
    return { urlXml: resultado.urlXml, urlPdf: resultado.urlPdf };
  }
}
