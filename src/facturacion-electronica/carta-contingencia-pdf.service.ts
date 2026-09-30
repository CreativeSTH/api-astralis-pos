import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface DatosCartaContingencia {
  tipo: 'INICIO' | 'FIN';
  razonSocial: string;
  nitConDv: string;
  ciudad: string;
  motivo: string;
  inicio: Date;
  fin: Date | null;
}

const fechaHora = (d: Date) =>
  d.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' });

/**
 * Carta de aviso de inconveniente tecnológico (anexo técnico FE v1.9, §12.1): la firma el representante
 * legal del negocio y se envía a contingencia.facturadorvp@dian.gov.co. AURA solo la arma; enviarla es
 * del negocio.
 */
@Injectable()
export class CartaContingenciaPdfService {
  generar(d: DatosCartaContingencia): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 72 });
      const partes: Buffer[] = [];
      doc.on('data', (p: Buffer) => partes.push(p));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);

      const hoy = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long' });
      doc.fontSize(11).text(d.ciudad ? `${d.ciudad}, ${hoy}` : hoy);
      doc.moveDown(2).text('Señores');
      doc.text('Dirección de Impuestos y Aduanas Nacionales — DIAN');
      doc.text('Factura electrónica — contingencia.facturadorvp@dian.gov.co');
      doc.moveDown();
      doc
        .font('Helvetica-Bold')
        .text(
          d.tipo === 'INICIO'
            ? 'Asunto: aviso de inconveniente tecnológico del facturador electrónico'
            : 'Asunto: aviso de superación del inconveniente tecnológico',
        );
      doc.font('Helvetica').moveDown();
      const cuerpo =
        d.tipo === 'INICIO'
          ? `${d.razonSocial}, NIT ${d.nitConDv}, informa que desde el ${fechaHora(d.inicio)} presenta un inconveniente tecnológico que le impide expedir factura electrónica de venta (motivo: ${d.motivo}). Mientras dure, expedirá factura de venta de talonario o de papel con la numeración de contingencia autorizada, y la transcribirá y transmitirá dentro de las 48 horas siguientes a superar el inconveniente, conforme al artículo 1.5.1.5.7.1 de la Resolución DIAN 000227 de 2025.`
          : `${d.razonSocial}, NIT ${d.nitConDv}, informa que el inconveniente tecnológico iniciado el ${fechaHora(d.inicio)} quedó superado el ${fechaHora(d.fin!)}. Las facturas de talonario o de papel expedidas en ese período se transcribirán y transmitirán dentro de las 48 horas siguientes, conforme al artículo 1.5.1.5.7.1 de la Resolución DIAN 000227 de 2025.`;
      doc.text(cuerpo, { align: 'justify' });
      doc.moveDown(4);
      doc.text('______________________________________');
      doc.text('Firma del representante legal');
      doc.text('Nombre:');
      doc.text('Documento de identidad:');
      doc.text('Teléfono de contacto:');
      doc.end();
    });
  }
}
