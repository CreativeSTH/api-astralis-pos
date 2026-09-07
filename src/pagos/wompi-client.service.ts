import { BadGatewayException, Injectable } from '@nestjs/common';

/**
 * Función, no constante de módulo — evaluar `process.env.WOMPI_BASE_URL` al importar este
 * archivo (que ocurre durante la resolución del árbol de imports de Nest, antes de que
 * `ConfigModule.forRoot()` cargue el `.env` dentro de `bootstrap()`) siempre devolvía el
 * default de producción sin importar el `.env` — bug real encontrado en vivo: cualquier
 * llamada a Wompi en desarrollo local golpeaba producción con llaves de sandbox.
 */
function baseUrl(): string {
  return process.env.WOMPI_BASE_URL ?? 'https://production.wompi.co/v1';
}

/**
 * Wompi devuelve el motivo del rechazo en el body (`{ error: { type, reason, messages } }`,
 * forma no 100% consistente entre endpoints — ver docs.wompi.co). Se arma un mensaje legible
 * a partir de lo que venga, sin asumir una forma exacta, para no tragarse la causa real
 * (credenciales inválidas, payload rechazado, etc.) detrás de un mensaje genérico — este error
 * es lo único que el cajero ve en el toast del POS.
 */
async function extraerMensajeError(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = await res.json();
    const error = body?.error;
    if (!error) return fallback;
    const detalles =
      error.messages && typeof error.messages === 'object'
        ? Object.values(error.messages).flat().join('; ')
        : undefined;
    return (
      [error.reason, detalles].filter(Boolean).join(' — ') ||
      error.type ||
      fallback
    );
  } catch {
    return fallback;
  }
}

@Injectable()
export class WompiClientService {
  async obtenerTokensAceptacion(llavePublica: string) {
    const res = await fetch(`${baseUrl()}/merchants/${llavePublica}`, {
      method: 'GET',
    });
    if (!res.ok) {
      throw new BadGatewayException(
        await extraerMensajeError(
          res,
          'No se pudo obtener el merchant de Wompi',
        ),
      );
    }
    const { data } = await res.json();
    return {
      acceptanceToken: data.presigned_acceptance.acceptance_token as string,
      acceptPersonalAuth: data.presigned_personal_data_auth
        .acceptance_token as string,
    };
  }

  async crearTransaccion(params: {
    llavePrivada: string;
    amountInCents: number;
    currency: string;
    reference: string;
    /** Firma de integridad exigida por Wompi en todo `POST /transactions` — ver `PagosService.iniciarPago`, que la calcula (Wompi la valida server-side, esta clase solo la transporta). */
    signature: string;
    acceptanceToken: string;
    acceptPersonalAuth: string;
    paymentMethod: Record<string, unknown>;
    customerEmail: string;
  }) {
    const res = await fetch(`${baseUrl()}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.llavePrivada}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        acceptance_token: params.acceptanceToken,
        accept_personal_auth: params.acceptPersonalAuth,
        amount_in_cents: params.amountInCents,
        currency: params.currency,
        reference: params.reference,
        signature: params.signature,
        customer_email: params.customerEmail,
        payment_method: params.paymentMethod,
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(
        await extraerMensajeError(
          res,
          'Wompi rechazó la creación de la transacción',
        ),
      );
    }
    const { data } = await res.json();
    return {
      wompiTransactionId: data.id as string,
      status: data.status as string,
      // Wompi trae acá lo que el frontend necesita para completar el pago
      // según el método (ej. `qr_image` en base64 para BANCOLOMBIA_QR,
      // `async_payment_url` para PSE) — no todos los métodos lo traen (NEQUI
      // no), y las claves varían por método, así que se devuelve tal cual,
      // sin interpretarlo acá.
      extra: data.payment_method?.extra as Record<string, unknown> | undefined,
    };
  }

  /**
   * `GET /transactions/{id}` — Wompi documenta que para BANCOLOMBIA_QR el `qr_image` NO viene en
   * la respuesta de `POST /transactions` (se genera async del lado de Wompi); hay que consultar
   * este endpoint hasta que aparezca (ver `PagosService.iniciarPago`, que hace el polling). Usa la
   * llave PÚBLICA como Bearer token — Wompi documenta explícitamente que la consulta de estado no
   * requiere la privada.
   */
  async obtenerTransaccion(transactionId: string, llavePublica: string) {
    const res = await fetch(`${baseUrl()}/transactions/${transactionId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${llavePublica}` },
    });
    if (!res.ok) {
      throw new BadGatewayException(
        await extraerMensajeError(
          res,
          'No se pudo consultar el estado de la transacción en Wompi',
        ),
      );
    }
    const { data } = await res.json();
    return {
      status: data.status as string,
      extra: data.payment_method?.extra as Record<string, unknown> | undefined,
    };
  }

  /** `POST /payment_sources` — crea una fuente de pago reusable a partir de un token ya tokenizado (tarjeta u otro método). */
  async crearFuentePago(params: {
    llavePrivada: string;
    token: string;
    customerEmail: string;
    acceptanceToken: string;
    acceptPersonalAuth: string;
  }): Promise<{ paymentSourceId: number }> {
    const res = await fetch(`${baseUrl()}/payment_sources`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.llavePrivada}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'CARD',
        token: params.token,
        customer_email: params.customerEmail,
        acceptance_token: params.acceptanceToken,
        accept_personal_auth: params.acceptPersonalAuth,
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(
        await extraerMensajeError(res, 'Wompi rechazó la creación de la fuente de pago'),
      );
    }
    const { data } = await res.json();
    return { paymentSourceId: data.id as number };
  }

  /** `POST /transactions` usando una fuente de pago ya guardada — camino usado tanto por el primer cobro con "guardar tarjeta" como por el cron de cobro automático (con `recurrente: true`). */
  async crearTransaccionConFuente(params: {
    llavePrivada: string;
    amountInCents: number;
    currency: string;
    reference: string;
    signature: string;
    paymentSourceId: number;
    customerEmail: string;
    recurrente?: boolean;
  }): Promise<{ wompiTransactionId: string; status: string }> {
    const res = await fetch(`${baseUrl()}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.llavePrivada}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount_in_cents: params.amountInCents,
        currency: params.currency,
        reference: params.reference,
        signature: params.signature,
        customer_email: params.customerEmail,
        payment_source_id: params.paymentSourceId,
        // Sin `payment_method.installments`, Wompi rechaza el POST con 422 "No se especificó el
        // número de cuotas (installments)" — confirmado en vivo contra el sandbox real antes de
        // este fix: sin esto, TODO cobro con fuente de pago (guardado inicial Y cobro automático
        // recurrente) fallaba siempre, encubierto porque el error nunca se probó contra Wompi de
        // verdad hasta este punto. Suscripciones siempre se cobran de una sola vez.
        payment_method: { installments: 1 },
        recurrent: params.recurrente ?? false,
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(
        await extraerMensajeError(res, 'Wompi rechazó la transacción con la fuente de pago guardada'),
      );
    }
    const { data } = await res.json();
    return { wompiTransactionId: data.id as string, status: data.status as string };
  }
}
