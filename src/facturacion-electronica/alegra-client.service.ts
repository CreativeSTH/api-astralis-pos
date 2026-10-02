import { BadGatewayException, Injectable } from '@nestjs/common';

async function extraerMensajeError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    const detalle = Array.isArray(body?.errors)
      ? body.errors.map((e: { message?: string }) => e.message).join('; ')
      : undefined;
    return detalle || body?.error?.reason || body?.message || fallback;
  } catch {
    return fallback;
  }
}

/**
 * `code` (StandardItemIdentification DIAN) es obligatorio — sin él, la DIAN
 * rechaza con "Regla DEAZ09: StandardItemIdentification no informado" (confirmado
 * en vivo). `identificationId: '999'` = "Estándar de adopción del contribuyente"
 * (catálogo DIAN), el valor que corresponde cuando no se declara el producto
 * contra un catálogo estándar (GTIN/UNSPSC).
 *
 * `subtotal` es el valor de la línea SIN impuesto y `total` CON impuesto —
 * si se manda el mismo valor en ambos (como antes), la DIAN rechaza con
 * "DEAU02a/DEAU06: el valor bruto no coincide con la suma de las líneas"
 * (confirmado en vivo). El desglose de impuesto por línea (`taxAmount`/`taxes`)
 * también es obligatorio pese a que la documentación pública de Alegra no lo
 * menciona como tal.
 */
export interface ItemAlegra {
  description: string;
  quantity: number;
  price: number;
  /** Catálogo UN/CEFACT de unidades de medida — "94" = unidad (confirmado en vivo contra el sandbox real). */
  unitCode: string;
  code: { identificationId: string; id: string };
  /** Valor de la línea SIN impuesto. */
  subtotal: number;
  /** Valor de la línea CON impuesto (subtotal + taxAmount). */
  total: number;
  taxAmount: number;
  taxes: { taxCode: string; taxAmount: number; taxPercentage: string; taxableAmount: number }[];
}

export interface TotalAmountsAlegra {
  total: number;
  grossTotal: number;
  taxableTotal: number;
  taxTotal: number;
  payableTotal: number;
  discountTotal: number;
  chargeTotal: number;
  advanceTotal: number;
  currencyCode: string;
}

/**
 * Shape de `/invoices` confirmado con `validate_co_payload` contra el
 * catálogo curado de Alanube (2026-09-01) — distinto del de `ItemAlegra`
 * (usado por `/equivalent-documents/pos`): `code` es un string simple, no
 * `{identificationId, id}`.
 */
export interface ItemFacturaAlegra {
  description: string;
  quantity: number;
  price: number;
  unitCode: string;
  code: string;
  /** Valor de la línea SIN impuesto. */
  subtotal: number;
  /** Valor de la línea CON impuesto (subtotal + taxAmount). */
  total: number;
  taxAmount: number;
  taxes: { taxCode: string; taxAmount: number; taxPercentage: string; taxableAmount: number }[];
}

/** `totalAmounts` de `/invoices` — sin `total` ni `currencyCode` (`validate_co_payload` los marca `UNSUPPORTED_FIELD`, a diferencia de `TotalAmountsAlegra` de DEE_POS). */
export interface TotalAmountsFacturaAlegra {
  grossTotal: number;
  taxableTotal: number;
  taxTotal: number;
  payableTotal: number;
  discountTotal: number;
  chargeTotal: number;
  advanceTotal: number;
}

/** `customer` de `/invoices`/`/credit-notes`/`/debit-notes` — campo `identificationNumber`, no `identification` (confirmado con `validate_co_payload`). "43" = identificador genérico DIAN de consumidor final. */
export interface CustomerAlegra {
  identificationNumber: string;
  identificationType: string;
  name: string;
  /** Dígito de verificación — obligatorio cuando `identificationType = '31'` (NIT). */
  dv?: string;
  /** 1 persona jurídica, 2 persona natural (default de Alanube). */
  organizationType?: 1 | 2;
  /** Correo del adquiriente (campo DIAN ElectronicMail). Alegra solo le escribe si la compañía tiene `notificationByEmail` — se crea apagado. */
  email?: string;
}

/** Referencia a la factura original que una nota crédito/débito ajusta. */
export interface DocumentoAsociadoAlegra {
  prefix: string;
  number: number;
  documentType: string;
  date: string;
  uuid: string;
}

export interface PaymentAlegra {
  /** Solo lo exige `/equivalent-documents/pos` (DEE_POS legado) — `/invoices` no lo acepta (`validate_co_payload` no lo marca ni como campo válido). */
  type?: string;
  amount?: number;
  /** "1" contado, "2" crédito (catálogo DIAN, confirmado en vivo). */
  paymentForm: string;
  /** Catálogo DIAN de medios de pago — 10 efectivo, 42 consignación, 45 transferencia crédito, 48 tarjeta crédito, 49 tarjeta débito. */
  paymentMethod: string;
  paymentDueDate: string;
}

export interface ResolutionAlegra {
  prefix: string;
  resolutionNumber: string;
  startDate: string;
  endDate: string;
  minNumber: number;
  maxNumber: number;
  technicalKey: string;
}

/**
 * Alegra no respondió (red caída, más de TIMEOUT_EMISION_MS, HTTP ≥ 500 o mantenimiento DIAN EPR5xx).
 * Es la única falla que cuenta para entrar en contingencia automática (fase 6a) — un rechazo o un 4xx
 * de validación no: ahí el problema es el documento, no la disponibilidad. Extiende BadGatewayException
 * para que todo el código que ya atrapa errores de Alegra siga funcionando igual.
 */
export class AlegraNoDisponibleError extends BadGatewayException {}

export const TIMEOUT_EMISION_MS = 20_000;

export interface DatosAlegraNotaCredito {
  alegraDocumentId: string;
  cude?: string;
  fullNumber?: string;
  prefix?: string;
  number?: number;
  fecha?: string;
  qrCodeContent?: string;
  status: string;
  legalStatus?: string;
  isFinal: boolean;
  trackingReference?: Record<string, unknown>;
  governmentResponseMessage?: string;
  errorMessages?: string[];
  urlXml?: string;
}

/** Raíz `creditNote` (MCP de Alanube 2026-10-02: `CreditNoteResponse = { creditNote, files }`). */
function leerNotaCredito(data: Record<string, any>, baseUrl: string): DatosAlegraNotaCredito {
  const nota = data.creditNote ?? data;
  const isFinal = nota.isFinal !== false;
  return {
    alegraDocumentId: nota.id as string,
    cude: nota.cude as string | undefined,
    fullNumber: nota.fullNumber as string | undefined,
    prefix: nota.prefix as string | undefined,
    number: nota.number as number | undefined,
    fecha: nota.date as string | undefined,
    qrCodeContent: nota.qrCodeContent as string | undefined,
    status: nota.status as string,
    legalStatus: nota.legalStatus as string | undefined,
    isFinal,
    trackingReference: isFinal
      ? undefined
      : { flow: 'co.credit-note', environment: baseUrl.includes('sandbox') ? 'sandbox' : 'production', documentId: nota.id as string },
    governmentResponseMessage: nota.governmentResponse?.message as string | undefined,
    errorMessages: nota.governmentResponse?.errorMessages as string[] | undefined,
    urlXml: data.files?.xml as string | undefined,
  };
}

/**
 * "Contingencia Facturador Electrónico" en la API de Alegra/Alanube = factura tipo 03 de la DIAN
 * (transcripción de una factura de talonario o de papel). OJO: en Alegra "03" es MANDATO — nunca usar
 * el código DIAN acá. Confirmado con el MCP de Alanube (`explain_co_field documentType`, 2026-09-29).
 */
export const DOCUMENT_TYPE_CONTINGENCIA_FACTURADOR = '04';

@Injectable()
export class AlegraClientService {
  /**
   * Shape confirmado en vivo contra el sandbox real de Alegra (2026-09-01) — la
   * documentación pública (createcompany.md) describía el campo como `nit` con
   * `address`/`city` planos; la API real exige `identification` + `dv` por
   * separado, `address` como objeto anidado ({address, city, department,
   * country} con `city`/`department` validados contra un enum estricto de
   * códigos DIVIPOLA reales), y además `organizationType`/`identificationType`
   * — sin esos dos últimos, la emisión de documentos rechaza con AEP6012/AEP6013
   * aunque la empresa se haya creado "bien". La respuesta viene envuelta en
   * `{ company: {...} }`, no un objeto plano.
   */
  async crearCompania(params: {
    token: string;
    baseUrl: string;
    identification: string;
    dv: string;
    identificationType: string;
    organizationType: number;
    razonSocial: string;
    direccion: string;
    ciudadCodigo: string;
    departamentoCodigo: string;
    email?: string;
    useAlegraCertificate: boolean;
    certificadoPfxBase64?: string;
    certificadoNombreArchivo?: string;
    certificadoPassword?: string;
  }): Promise<{ companyId: string }> {
    const res = await fetch(`${params.baseUrl}/companies`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.razonSocial,
        identification: params.identification,
        dv: params.dv,
        identificationType: params.identificationType,
        organizationType: params.organizationType,
        useAlegraCertificate: params.useAlegraCertificate,
        // AURA manda el correo de la factura (fase 7): sin esto Alegra podría mandar uno propio al customer.email.
        notificationByEmail: { enabled: false },
        // Alegra rechaza `email: null` con un error de tipo — hay que omitir la
        // clave entera si el negocio no tiene correo cargado, no mandar null.
        ...(params.email ? { email: params.email } : {}),
        address: {
          address: params.direccion,
          city: params.ciudadCodigo,
          department: params.departamentoCodigo,
          country: 'CO',
        },
        ...(params.useAlegraCertificate
          ? {}
          : {
              certificate: {
                name: params.certificadoNombreArchivo ?? 'certificado.p12',
                extension: 'p12',
                content: params.certificadoPfxBase64,
                password: params.certificadoPassword,
              },
            }),
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(await extraerMensajeError(res, 'Alegra rechazó la creación de la empresa'));
    }
    const data = await res.json();
    return { companyId: data.company.id as string };
  }

  /**
   * `governmentId` es el TestSetId emitido por la propia DIAN en su portal de
   * Habilitación — Alegra NO lo genera, hay que suministrarlo (confirmado en
   * vivo: sin este campo, la API responde "instance requires property
   * governmentId"). Para sandbox existe un id público documentado
   * (a70562e0-631e-4ceb-aa65-36887b57dc17) que no depende de trámite real.
   * Respuesta envuelta en `{ testSet: {...} }` (singular).
   */
  async crearTestSet(params: {
    token: string;
    baseUrl: string;
    companyId: string;
    tipo: 'pos' | 'invoices' | 'payrolls';
    governmentId: string;
  }): Promise<{ testSetId: string }> {
    const res = await fetch(`${params.baseUrl}/test-sets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: { id: params.companyId },
        type: params.tipo,
        governmentId: params.governmentId,
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(await extraerMensajeError(res, 'Alegra rechazó la creación del testset'));
    }
    const data = await res.json();
    return { testSetId: data.testSet.id as string };
  }

  /**
   * `GET /companies/{id}` — usado para chequear `governmentStatus.pos` después de
   * `crearTestSet`. Confirmado en vivo (2026-09-01) que la autorización de la DIAN
   * no es instantánea: justo después de que `crearTestSet` responde 200, la primera
   * emisión de un documento equivalente POS puede rechazar con "The company is not
   * authorized by government entity..." aunque unos segundos después ya figure
   * `AUTHORIZED` — de ahí el polling en `confirmarTestSet`, no alcanza con confiar
   * en la respuesta 200 de `crearTestSet`.
   */
  async consultarCompania(params: {
    token: string;
    baseUrl: string;
    companyId: string;
    /** Qué tipo de habilitación chequear en `governmentStatus` — cada tipo de documento (pos/invoices) tiene su propia autorización independiente ante la DIAN. */
    tipo: 'pos' | 'invoices';
  }): Promise<{ posAutorizado: boolean }> {
    const res = await fetch(`${params.baseUrl}/companies/${params.companyId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.token}` },
    });
    if (!res.ok) {
      throw new BadGatewayException(await extraerMensajeError(res, 'No se pudo consultar el estado de la empresa en Alegra'));
    }
    const data = await res.json();
    return { posAutorizado: data.company?.governmentStatus?.[params.tipo] === 'AUTHORIZED' };
  }

  /**
   * Shape confirmado con `validate_co_payload` contra el catálogo curado de
   * Alanube (`co.invoices.create`, 2026-09-01) — reemplaza el `crearFactura`
   * anterior, que nunca se había verificado. Diferencias clave frente a
   * `/equivalent-documents/pos`: `number` es NUMBER (no string), `customer`
   * usa `identificationNumber` (no `identification`), `items[].code` es un
   * STRING simple (no `{identificationId, id}`), y `totalAmounts` no acepta
   * `total` ni `currencyCode` (`UNSUPPORTED_FIELD`). La respuesta puede
   * llegar `isFinal: false` si la DIAN está intermitente — sin `legalStatus`
   * todavía; hay que guardar el `trackingReference` para consultar después
   * con `consultarFactura`, nunca reenviar (arriesga duplicar el número).
   * Alegra no devuelve PDF — `files` solo trae `xml`/`attachedDocument`/`zip` (MCP Alanube +
   * sandbox real, 2026-09-28); la representación gráfica la genera `FacturaPdfService`.
   */
  async crearFactura(params: {
    token: string;
    baseUrl: string;
    companyId: string;
    number: number;
    resolution: ResolutionAlegra;
    /** Catálogo DIAN de obligaciones/responsabilidades fiscales del emisor — confirmado en vivo: sin esto la DIAN rechaza con "The 'regimeCode' attribute is required". Enum real: O-13/15/23/47/48/49 o R-99-PN. */
    regimeCode: string;
    /** Confirmado en vivo: sin esto la DIAN rechaza con "instance requires property invoicePeriod" pese a que el catálogo curado lo marca opcional — es una regla condicional real no reflejada ahí. Para una venta puntual (no un servicio por suscripción), `startDate`/`endDate` son la misma fecha. */
    invoicePeriod: { startDate: string; endDate: string };
    customer: CustomerAlegra;
    items: ItemFacturaAlegra[];
    payments: PaymentAlegra[];
    totalAmounts: TotalAmountsFacturaAlegra;
    /** '01' estándar (default) o DOCUMENT_TYPE_CONTINGENCIA_FACTURADOR para transcribir una factura de papel. */
    documentType?: '01' | '04';
    /** Obligatorio con '04': número (con prefijo) y fecha ('YYYY-MM-DD') de la factura de papel entregada. */
    additionalDocumentReference?: { number: string; issueDate: string };
  }): Promise<{
    alegraDocumentId: string;
    cufe?: string;
    fullNumber?: string;
    prefix?: string;
    number?: number;
    fecha?: string;
    /** Texto exacto que la DIAN exige dentro del QR de la representación gráfica. */
    qrCodeContent?: string;
    status: string;
    legalStatus?: string;
    isFinal: boolean;
    trackingReference?: { flow: 'co.invoice'; environment: string; documentId: string };
    governmentResponseMessage?: string;
    errorMessages?: string[];
    urlXml?: string;
    urlZip?: string;
  }> {
    let res: Response;
    try {
      res = await fetch(`${params.baseUrl}/invoices`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_EMISION_MS),
        body: JSON.stringify({
          documentType: params.documentType ?? '01',
          number: params.number,
          invoicePeriod: params.invoicePeriod,
          resolution: params.resolution,
          company: { id: params.companyId, regimeCode: params.regimeCode },
          customer: params.customer,
          items: params.items,
          payments: params.payments,
          totalAmounts: params.totalAmounts,
          ...(params.additionalDocumentReference ? { additionalDocumentReference: params.additionalDocumentReference } : {}),
        }),
      });
    } catch (error) {
      throw new AlegraNoDisponibleError(`Alegra no respondió: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!res.ok) {
      const mensaje = await extraerMensajeError(res, 'Alegra rechazó la creación de la factura');
      if (res.status >= 500 || mensaje.includes('EPR5')) throw new AlegraNoDisponibleError(mensaje);
      throw new BadGatewayException(mensaje);
    }
    const data = await res.json();
    const invoice = data.invoice;
    const isFinal = invoice.isFinal !== false;
    return {
      alegraDocumentId: invoice.id as string,
      cufe: invoice.cufe as string | undefined,
      fullNumber: invoice.fullNumber as string | undefined,
      prefix: invoice.prefix as string | undefined,
      number: invoice.number as number | undefined,
      fecha: invoice.date as string | undefined,
      qrCodeContent: invoice.qrCodeContent as string | undefined,
      status: invoice.status as string,
      legalStatus: invoice.legalStatus as string | undefined,
      isFinal,
      trackingReference: isFinal
        ? undefined
        : { flow: 'co.invoice', environment: params.baseUrl.includes('sandbox') ? 'sandbox' : 'production', documentId: invoice.id as string },
      governmentResponseMessage: invoice.governmentResponse?.message as string | undefined,
      errorMessages: invoice.governmentResponse?.errorMessages as string[] | undefined,
      urlXml: data.files?.xml as string | undefined,
      urlZip: data.files?.zip as string | undefined,
    };
  }

  /**
   * `GET /invoices/{id}` — resuelve el estado de una factura que quedó `isFinal: false`, y es la
   * fuente del backfill del snapshot de representación gráfica. Mismo shape de respuesta que
   * `crearFactura` — incluye `qrCodeContent`. Confirmado en vivo contra el sandbox (2026-09-28):
   * Alegra/Alanube no genera PDF, `files` solo trae `xml`/`attachedDocument`/`zip`.
   */
  async consultarFactura(params: { token: string; baseUrl: string; documentId: string }): Promise<{
    alegraDocumentId: string;
    cufe?: string;
    fullNumber?: string;
    prefix?: string;
    number?: number;
    fecha?: string;
    qrCodeContent?: string;
    status: string;
    legalStatus?: string;
    isFinal: boolean;
    governmentResponseMessage?: string;
    errorMessages?: string[];
    urlXml?: string;
    urlZip?: string;
    /** Contenedor DIAN (factura + aprobación) que se le entrega al adquiriente — Anexo Técnico 9.1. */
    urlAttachedDocument?: string;
  }> {
    const res = await fetch(`${params.baseUrl}/invoices/${params.documentId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.token}` },
    });
    if (!res.ok) {
      throw new BadGatewayException(await extraerMensajeError(res, 'No se pudo consultar la factura en Alegra'));
    }
    const data = await res.json();
    const invoice = data.invoice;
    return {
      alegraDocumentId: invoice.id as string,
      cufe: invoice.cufe as string | undefined,
      fullNumber: invoice.fullNumber as string | undefined,
      prefix: invoice.prefix as string | undefined,
      number: invoice.number as number | undefined,
      fecha: invoice.date as string | undefined,
      qrCodeContent: invoice.qrCodeContent as string | undefined,
      status: invoice.status as string,
      legalStatus: invoice.legalStatus as string | undefined,
      isFinal: invoice.isFinal !== false,
      governmentResponseMessage: invoice.governmentResponse?.message as string | undefined,
      errorMessages: invoice.governmentResponse?.errorMessages as string[] | undefined,
      urlXml: data.files?.xml as string | undefined,
      urlZip: data.files?.zip as string | undefined,
      urlAttachedDocument: data.files?.attachedDocument as string | undefined,
    };
  }

  /**
   * Shape del request confirmado con `validate_co_payload` (`co.credit-notes.create`, 2026-09-01) —
   * usado para la nota crédito del testset de habilitación (ver `confirmarTestSet`) y para las notas
   * crédito de devoluciones. `conceptCode` "1" = devolución parcial, "2" = anulación (catálogo DIAN).
   * La respuesta es `{ creditNote, files }` (MCP de Alanube, 2026-10-02) y trae `cude`, no `cufe`.
   */
  async crearNotaCredito(params: {
    token: string;
    baseUrl: string;
    companyId: string;
    /** Opcional en la API; las notas de devoluciones usan PREFIJO_NOTA_CREDITO. */
    prefix?: string;
    number: number;
    conceptCode: string;
    documentoAsociado: DocumentoAsociadoAlegra;
    regimeCode: string;
    invoicePeriod: { startDate: string; endDate: string };
    customer: CustomerAlegra;
    items: ItemFacturaAlegra[];
    payments: PaymentAlegra[];
    totalAmounts: TotalAmountsFacturaAlegra;
  }): Promise<DatosAlegraNotaCredito> {
    let res: Response;
    try {
      res = await fetch(`${params.baseUrl}/credit-notes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_EMISION_MS),
        body: JSON.stringify({
          conceptCode: params.conceptCode,
          ...(params.prefix ? { prefix: params.prefix } : {}),
          number: params.number,
          invoicePeriod: params.invoicePeriod,
          associatedDocuments: [params.documentoAsociado],
          company: { id: params.companyId, regimeCode: params.regimeCode },
          customer: params.customer,
          items: params.items,
          payments: params.payments,
          totalAmounts: params.totalAmounts,
        }),
      });
    } catch (error) {
      throw new AlegraNoDisponibleError(`Alegra no respondió: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!res.ok) {
      const mensaje = await extraerMensajeError(res, 'Alegra rechazó la creación de la nota crédito');
      if (res.status >= 500 || mensaje.includes('EPR5')) throw new AlegraNoDisponibleError(mensaje);
      throw new BadGatewayException(mensaje);
    }
    return leerNotaCredito(await res.json(), params.baseUrl);
  }

  /** `GET /credit-notes/{id}` — resuelve una nota que quedó `isFinal: false` y da la URL del XML. */
  async consultarNotaCredito(params: { token: string; baseUrl: string; documentId: string }): Promise<DatosAlegraNotaCredito> {
    const res = await fetch(`${params.baseUrl}/credit-notes/${params.documentId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.token}` },
    });
    if (!res.ok) {
      throw new BadGatewayException(await extraerMensajeError(res, 'No se pudo consultar la nota crédito en Alegra'));
    }
    return leerNotaCredito(await res.json(), params.baseUrl);
  }

  /**
   * Shape confirmado con `validate_co_payload` (`co.debit-notes.create`,
   * 2026-09-01) — usado solo para el testset de habilitación de Factura
   * (ver `confirmarTestSet`). `conceptCode` "4" = "Otros" (catálogo DIAN de
   * conceptos de nota débito), el motivo usado para la nota del testset.
   */
  async crearNotaDebito(params: {
    token: string;
    baseUrl: string;
    companyId: string;
    number: number;
    conceptCode: string;
    documentoAsociado: DocumentoAsociadoAlegra;
    regimeCode: string;
    invoicePeriod: { startDate: string; endDate: string };
    customer: CustomerAlegra;
    items: ItemFacturaAlegra[];
    payments: PaymentAlegra[];
    totalAmounts: TotalAmountsFacturaAlegra;
  }): Promise<{ alegraDocumentId: string; status: string; legalStatus?: string; isFinal: boolean }> {
    const res = await fetch(`${params.baseUrl}/debit-notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conceptCode: params.conceptCode,
        number: params.number,
        invoicePeriod: params.invoicePeriod,
        associatedDocuments: [params.documentoAsociado],
        company: { id: params.companyId, regimeCode: params.regimeCode },
        customer: params.customer,
        items: params.items,
        payments: params.payments,
        totalAmounts: params.totalAmounts,
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(await extraerMensajeError(res, 'Alegra rechazó la creación de la nota débito'));
    }
    const data = await res.json();
    const nota = data.debitNote ?? data;
    return {
      alegraDocumentId: nota.id as string,
      status: nota.status as string,
      legalStatus: nota.legalStatus as string | undefined,
      isFinal: nota.isFinal !== false,
    };
  }

  /**
   * Shape de request confirmado en vivo, campo por campo, contra el sandbox real
   * (2026-09-01) — la documentación pública solo mencionaba company/number/items/
   * totalAmounts/payments; la API real además exige: `number` como STRING (no
   * number), `items[].unitCode`/`.subtotal`/`.total`, `totalAmounts.grossTotal`/
   * `.taxableTotal`/`.taxTotal`/`.payableTotal`, `payments[].paymentForm`/
   * `.paymentMethod`/`.paymentDueDate`, y un objeto `resolution` completo con
   * nombres de campo distintos a los de `HabilitacionFacturacionElectronica`
   * (`resolutionNumber`/`minNumber`/`maxNumber`, no `numero`/`rangoDesde`/
   * `rangoHasta`). Además la compañía emisora necesita `organizationType` e
   * `identificationType` seteados (ver crearCompania) o esto rechaza con
   * AEP6012/AEP6013 aunque el resto del payload esté perfecto.
   * Respuesta envuelta en `{ equivalentDocument: {...}, files: { xml, zip } }`.
   */
  async crearDocumentoEquivalentePos(params: {
    token: string;
    baseUrl: string;
    companyId: string;
    number: string;
    resolution: ResolutionAlegra;
    items: ItemAlegra[];
    totalAmounts: TotalAmountsAlegra;
    payments: PaymentAlegra[];
  }): Promise<{
    alegraDocumentId: string;
    cude?: string;
    fullNumber?: string;
    fecha?: string;
    status: string;
    legalStatus?: string;
    /** Motivo real de la DIAN cuando legalStatus es REJECTED (ej. "NIT X no autorizado a enviar documentos para emisor con NIT Y") — confirmado en vivo. */
    governmentResponseMessage?: string;
  }> {
    const res = await fetch(`${params.baseUrl}/equivalent-documents/pos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: { id: params.companyId },
        number: params.number,
        resolution: params.resolution,
        items: params.items,
        totalAmounts: params.totalAmounts,
        payments: params.payments,
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(
        await extraerMensajeError(res, 'Alegra rechazó la creación del documento equivalente POS'),
      );
    }
    const data = await res.json();
    return {
      alegraDocumentId: data.equivalentDocument.id as string,
      cude: data.equivalentDocument.cude as string | undefined,
      fullNumber: data.equivalentDocument.fullNumber as string | undefined,
      fecha: data.equivalentDocument.date as string | undefined,
      status: data.equivalentDocument.status as string,
      legalStatus: data.equivalentDocument.legalStatus as string | undefined,
      governmentResponseMessage: data.equivalentDocument.governmentResponse?.message as string | undefined,
    };
  }

  /**
   * Shape de request confirmado en vivo (2026-09-01) — la documentación pública
   * llamaba al endpoint `/equivalent-documents/pos/adjustment-notes` (404 real
   * contra el sandbox); el path correcto es `/adjustment-note-equivalent-documents`,
   * y el body no es solo "referenciar el documento origen": exige `documentReference`
   * ({fullNumber, cude, issueDate} del documento que se ajusta), `discrepancy`
   * ({responseCode} NUMÉRICO, 1-6, catálogo de motivos DIAN — se usa 1 "Anulación
   * del documento" para el ajuste de prueba del testset), y el mismo trío items/
   * totalAmounts/payments que `crearDocumentoEquivalentePos`. Usado únicamente
   * por el testset de habilitación (Task 4), no expuesto a uso operativo normal
   * (ver spec sección 7). Respuesta envuelta en `{ adjustmentNoteEquivalentDocument: {...} }`.
   */
  async crearNotaAjuste(params: {
    token: string;
    baseUrl: string;
    companyId: string;
    number: string;
    /** Catálogo DIAN de motivos de ajuste — 1 = "Anulación del documento" (confirmado en vivo, único usado hoy: testset de prueba). */
    discrepancyResponseCode: number;
    documentoOrigen: { fullNumber: string; cude: string; issueDate: string };
    items: ItemAlegra[];
    totalAmounts: TotalAmountsAlegra;
    payments: PaymentAlegra[];
  }): Promise<{ alegraDocumentId: string; status: string; legalStatus?: string }> {
    const res = await fetch(`${params.baseUrl}/adjustment-note-equivalent-documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: params.number,
        company: { id: params.companyId },
        documentReference: {
          fullNumber: params.documentoOrigen.fullNumber,
          cude: params.documentoOrigen.cude,
          issueDate: params.documentoOrigen.issueDate,
        },
        discrepancy: { responseCode: params.discrepancyResponseCode },
        items: params.items,
        totalAmounts: params.totalAmounts,
        payments: params.payments,
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(await extraerMensajeError(res, 'Alegra rechazó la nota de ajuste'));
    }
    const data = await res.json();
    return {
      alegraDocumentId: data.adjustmentNoteEquivalentDocument.id as string,
      status: data.adjustmentNoteEquivalentDocument.status as string,
      legalStatus: data.adjustmentNoteEquivalentDocument.legalStatus as string | undefined,
    };
  }

  /**
   * `GET /equivalent-documents/{id}` para DEE-POS, `GET /invoices/{id}` para
   * factura completa — son endpoints distintos, no un `/documents/{id}`
   * genérico como asumía el código original (ese path devuelve 404, confirmado
   * en vivo). La respuesta reusa el mismo shape que el POST de creación —
   * `{ equivalentDocument: {...}, files: { xml, zip } }` (sin `pdf` confirmado
   * para DEE-POS; factura completa no se probó en vivo).
   *
   * Solo para DEE_POS histórico (documentos emitidos antes del rediseño a
   * Factura Electrónica única). Todo documento nuevo es `FACTURA` y usa
   * `consultarFactura` (`GET /invoices/{id}`), no este método.
   */
  async consultarDocumento(params: {
    token: string;
    baseUrl: string;
    alegraDocumentId: string;
    tipo: 'DEE_POS' | 'FACTURA';
  }): Promise<{ status: string; legalStatus?: string; urlXml?: string; urlPdf?: string }> {
    const path = params.tipo === 'FACTURA' ? 'invoices' : 'equivalent-documents';
    const claveRaiz = params.tipo === 'FACTURA' ? 'invoice' : 'equivalentDocument';
    const res = await fetch(`${params.baseUrl}/${path}/${params.alegraDocumentId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.token}` },
    });
    if (!res.ok) {
      throw new BadGatewayException(await extraerMensajeError(res, 'No se pudo consultar el documento en Alegra'));
    }
    const data = await res.json();
    return {
      status: data[claveRaiz]?.status as string,
      legalStatus: data[claveRaiz]?.legalStatus as string | undefined,
      urlXml: data.files?.xml as string | undefined,
      urlPdf: data.files?.pdf as string | undefined,
    };
  }
}
