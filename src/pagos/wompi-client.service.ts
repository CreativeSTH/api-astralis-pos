import { Injectable } from '@nestjs/common';

const BASE_URL = process.env.WOMPI_BASE_URL ?? 'https://production.wompi.co/v1';

@Injectable()
export class WompiClientService {
  async obtenerTokensAceptacion(llavePublica: string) {
    const res = await fetch(`${BASE_URL}/merchants/${llavePublica}`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error('No se pudo obtener el merchant de Wompi');
    const { data } = await res.json();
    return {
      acceptanceToken: data.presigned_acceptance.acceptance_token as string,
      acceptPersonalAuth: data.presigned_personal_data_auth.acceptance_token as string,
    };
  }

  async crearTransaccion(params: {
    llavePrivada: string;
    amountInCents: number;
    reference: string;
    acceptanceToken: string;
    acceptPersonalAuth: string;
    paymentMethod: Record<string, unknown>;
    customerEmail: string;
  }) {
    const res = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.llavePrivada}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        acceptance_token: params.acceptanceToken,
        accept_personal_auth: params.acceptPersonalAuth,
        amount_in_cents: params.amountInCents,
        currency: 'COP',
        reference: params.reference,
        customer_email: params.customerEmail,
        payment_method: params.paymentMethod,
      }),
    });
    if (!res.ok) throw new Error('Wompi rechazó la creación de la transacción');
    const { data } = await res.json();
    return { wompiTransactionId: data.id as string, status: data.status as string };
  }
}
