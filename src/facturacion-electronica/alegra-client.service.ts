import { BadGatewayException, Injectable } from '@nestjs/common';

async function extraerMensajeError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.reason ?? body?.message ?? fallback;
  } catch {
    return fallback;
  }
}

@Injectable()
export class AlegraClientService {
  async crearCompania(params: {
    token: string;
    baseUrl: string;
    nit: string;
    razonSocial: string;
    direccion: string;
    ciudad: string;
    useAlegraCertificate: boolean;
    certificadoPfxBase64?: string;
    certificadoPassword?: string;
  }): Promise<{ companyId: string }> {
    const res = await fetch(`${params.baseUrl}/companies`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nit: params.nit,
        name: params.razonSocial,
        address: params.direccion,
        city: params.ciudad,
        useAlegraCertificate: params.useAlegraCertificate,
        ...(params.useAlegraCertificate
          ? {}
          : { certificate: params.certificadoPfxBase64, certificatePassword: params.certificadoPassword }),
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(await extraerMensajeError(res, 'Alegra rechazó la creación de la empresa'));
    }
    const data = await res.json();
    return { companyId: data.id as string };
  }

  async crearTestSet(params: { token: string; baseUrl: string; companyId: string }): Promise<{ testSetId: string }> {
    const res = await fetch(`${params.baseUrl}/test-sets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: params.companyId }),
    });
    if (!res.ok) {
      throw new BadGatewayException(await extraerMensajeError(res, 'Alegra rechazó la creación del testset'));
    }
    const data = await res.json();
    return { testSetId: data.id as string };
  }

  async crearFactura(params: {
    token: string;
    baseUrl: string;
    companyId: string;
    number: number;
    customer: Record<string, unknown>;
    items: Record<string, unknown>[];
    totalAmounts: Record<string, unknown>;
    payments: Record<string, unknown>[];
  }): Promise<{ alegraDocumentId: string; cufe?: string; status: string; legalStatus?: string }> {
    const res = await fetch(`${params.baseUrl}/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: { id: params.companyId },
        number: params.number,
        customer: params.customer,
        items: params.items,
        totalAmounts: params.totalAmounts,
        payments: params.payments,
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(await extraerMensajeError(res, 'Alegra rechazó la creación de la factura'));
    }
    const data = await res.json();
    return {
      alegraDocumentId: data.id as string,
      cufe: data.cufe as string | undefined,
      status: data.status as string,
      legalStatus: data.legalStatus as string | undefined,
    };
  }

  /** Shape de request/response confirmado contra e-provider-docs.alegra.com — ver docs/ARQUITECTURA-V2.md sección 4. */
  async crearDocumentoEquivalentePos(params: {
    token: string;
    baseUrl: string;
    companyId: string;
    number: number;
    items: Record<string, unknown>[];
    totalAmounts: Record<string, unknown>;
    payments: Record<string, unknown>[];
  }): Promise<{ alegraDocumentId: string; cude?: string; status: string; legalStatus?: string }> {
    const res = await fetch(`${params.baseUrl}/equivalent-documents/pos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: { id: params.companyId },
        number: params.number,
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
      alegraDocumentId: data.id as string,
      cude: data.cude as string | undefined,
      status: data.status as string,
      legalStatus: data.legalStatus as string | undefined,
    };
  }

  /** Usado únicamente por el testset de habilitación (Task 4) — no expuesto a uso operativo normal (ver spec sección 7). */
  async crearNotaAjuste(params: {
    token: string;
    baseUrl: string;
    companyId: string;
    documentoOrigenId: string;
    motivo: string;
  }): Promise<{ alegraDocumentId: string; status: string }> {
    const res = await fetch(`${params.baseUrl}/equivalent-documents/pos/adjustment-notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: { id: params.companyId },
        originDocument: { id: params.documentoOrigenId },
        reason: params.motivo,
      }),
    });
    if (!res.ok) {
      throw new BadGatewayException(await extraerMensajeError(res, 'Alegra rechazó la nota de ajuste'));
    }
    const data = await res.json();
    return { alegraDocumentId: data.id as string, status: data.status as string };
  }

  async consultarDocumento(params: {
    token: string;
    baseUrl: string;
    alegraDocumentId: string;
  }): Promise<{ status: string; legalStatus?: string; urlXml?: string; urlPdf?: string }> {
    const res = await fetch(`${params.baseUrl}/documents/${params.alegraDocumentId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.token}` },
    });
    if (!res.ok) {
      throw new BadGatewayException(await extraerMensajeError(res, 'No se pudo consultar el documento en Alegra'));
    }
    const data = await res.json();
    return {
      status: data.status as string,
      legalStatus: data.legalStatus as string | undefined,
      urlXml: data.xmlUrl as string | undefined,
      urlPdf: data.pdfUrl as string | undefined,
    };
  }
}
