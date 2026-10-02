import { zipSync } from 'fflate';
import { limpiarNit } from '../common/utils/nit';

/**
 * Entrega de la factura al adquiriente por correo — Anexo Técnico de Factura Electrónica v1.8,
 * sección 9.1: un único .ZIP con el AttachedDocument (factura + ApplicationResponse de la DIAN) y,
 * opcional, el PDF; asunto "NIT;Nombre;Número;Tipo;Nombre comercial"; máximo 2 MB por envío.
 */
export const PESO_MAXIMO_ZIP_BYTES = 2 * 1024 * 1024;

/** El `;` separa los campos del asunto — dentro de un nombre se cambia por coma. */
const campo = (texto: string) => texto.replace(/;/g, ',').trim();

export function asuntoCorreoFactura(p: {
  nitEmisor: string;
  razonSocial: string;
  numero: string;
  tipoDocumento: string;
  nombreComercial: string;
}): string {
  const nit = limpiarNit(p.nitEmisor.split('-')[0]);
  return [nit, campo(p.razonSocial), p.numero, p.tipoDocumento, campo(p.nombreComercial)].join(';');
}

/** `cbc:InvoiceTypeCode` de la factura dentro del AttachedDocument (va en CDATA o escapada según el proveedor). */
export function codigoTipoDocumento(attachedDocumentXml: string): string {
  const coincidencia = attachedDocumentXml.match(/InvoiceTypeCode[^>&]*(?:>|&gt;)\s*(\d{2})\s*(?:<|&lt;)/);
  return coincidencia?.[1] ?? '01';
}

export function armarZipFactura(p: { nombreBase: string; pdf: Buffer; attachedDocument: Buffer }): Buffer {
  return Buffer.from(
    zipSync({
      [`${p.nombreBase}.pdf`]: new Uint8Array(p.pdf),
      [`${p.nombreBase}.xml`]: new Uint8Array(p.attachedDocument),
    }),
  );
}
