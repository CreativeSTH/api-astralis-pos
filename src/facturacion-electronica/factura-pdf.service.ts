import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { EstadoDocumentoElectronico } from './entities/estado-documento-electronico.enum';
import { calcularDigitoVerificacion, limpiarNit } from '../common/utils/nit';

export interface DatosFacturaPdf {
  documento: {
    estado: EstadoDocumentoElectronico;
    ambiente?: 'SANDBOX' | 'PRODUCCION';
    numeroCompleto?: string;
    fechaEmision?: Date;
    cufe?: string;
    qrContenido?: string;
    prefijo?: string;
    resolucionNumero?: string;
    resolucionFechaInicio?: string;
    resolucionFechaFin?: string;
    resolucionRangoDesde?: number;
    resolucionRangoHasta?: number;
    emisorRazonSocial?: string;
    emisorNit?: string;
    emisorDireccion?: string;
    emisorCiudad?: string;
  };
  venta: {
    tipoVenta: string;
    subtotal: number;
    descuentoTotal: number;
    impuestoTotal: number;
    total: number;
    nombreCliente: string;
    cliente?: { nombre: string; documentoIdentidad?: string; tipoDocumentoIdentidad?: string } | null;
    items: { nombreProducto: string; cantidad: number; precioUnitario: number; baseImponible: number; impuesto: number }[];
    pagos: { metodoPago: string; monto: number }[];
  };
  logo: Buffer | null;
}

export interface ContenidoFacturaPdf {
  marcaDeAgua: string | null;
  emisor: { razonSocial: string; nitConDv: string; regimen: string; direccion: string };
  encabezado: { titulo: string; numero: string; fechaEmision: string };
  adquirente: { nombre: string; identificacion: string };
  lineas: { descripcion: string; cantidad: string; valorUnitario: string; base: string; porcentajeIva: string; iva: string; total: string }[];
  totales: { etiqueta: string; valor: string }[];
  pago: { forma: string; medios: string[] };
  resolucion: string;
  cufe: string;
  qrContenido: string;
  pie: string[];
}

/** Siglas del catálogo DIAN de tipos de documento (mismo enum que `/invoices`: 11/12/13/21/22/31/41/42/47/48/50/91). */
const SIGLA_DOCUMENTO: Record<string, string> = {
  '11': 'RC', '12': 'TI', '13': 'CC', '21': 'TE', '22': 'CE', '31': 'NIT', '41': 'PA', '42': 'DE', '47': 'PEP', '48': 'PPT', '50': 'NIT ext.', '91': 'NUIP',
};

const FORMATO_PESOS = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function formatearPesos(valor: number): string {
  return FORMATO_PESOS.format(Number(valor));
}

/** `YYYY-MM-DD HH:mm:ss` en hora de Colombia (UTC-5 fijo, sin horario de verano). */
export function fechaHoraBogota(fecha: Date): string {
  return fecha.toLocaleString('sv-SE', { timeZone: 'America/Bogota' });
}

/** Spec 2026-09-28, sección 5 — rechazada tiene prioridad sobre sandbox. */
export function marcaDeAguaPara(estado: EstadoDocumentoElectronico, ambiente?: 'SANDBOX' | 'PRODUCCION'): string | null {
  if (estado === EstadoDocumentoElectronico.RECHAZADO) return 'RECHAZADA POR LA DIAN — SIN VALIDEZ FISCAL';
  if (ambiente === 'SANDBOX') return 'DOCUMENTO DE PRUEBA — SIN VALIDEZ FISCAL';
  if (estado === EstadoDocumentoElectronico.PENDIENTE || estado === EstadoDocumentoElectronico.ERROR) return 'PENDIENTE DE VALIDACIÓN DIAN';
  return null;
}

const MARGEN = 40;
const ANCHO = 612 - MARGEN * 2; // carta: 612 x 792 pt
const COLUMNAS = [
  { clave: 'descripcion', titulo: 'Descripción', ancho: 180, align: 'left' },
  { clave: 'cantidad', titulo: 'Cant.', ancho: 40, align: 'right' },
  { clave: 'valorUnitario', titulo: 'Valor unit.', ancho: 70, align: 'right' },
  { clave: 'base', titulo: 'Base', ancho: 70, align: 'right' },
  { clave: 'porcentajeIva', titulo: '% IVA', ancho: 40, align: 'right' },
  { clave: 'iva', titulo: 'IVA', ancho: 60, align: 'right' },
  { clave: 'total', titulo: 'Total', ancho: 72, align: 'right' },
] as const;

/**
 * Representación gráfica (PDF carta) de una factura electrónica de venta. Alegra/Alanube
 * no genera PDF (confirmado 2026-09-28) — lo arma AURA con el snapshot guardado en
 * `DocumentoElectronico`. Sin acceso a repositorios: recibe todo ya resuelto.
 */
@Injectable()
export class FacturaPdfService {
  private readonly logger = new Logger(FacturaPdfService.name);

  construirContenido({ documento: d, venta: v }: DatosFacturaPdf): ContenidoFacturaPdf {
    const nit = d.emisorNit ? limpiarNit(d.emisorNit) : '';
    const tieneDocumento = !!(v.cliente?.documentoIdentidad && v.cliente.tipoDocumentoIdentidad);
    const prefijo = d.prefijo ?? '';

    return {
      marcaDeAgua: marcaDeAguaPara(d.estado, d.ambiente),
      emisor: {
        razonSocial: d.emisorRazonSocial ?? '',
        nitConDv: nit ? `${nit}-${calcularDigitoVerificacion(nit)}` : '',
        regimen: 'Responsable de IVA (O-48)',
        direccion: [d.emisorDireccion, d.emisorCiudad].filter(Boolean).join(', '),
      },
      encabezado: {
        titulo: 'FACTURA ELECTRÓNICA DE VENTA',
        numero: d.numeroCompleto ?? '',
        fechaEmision: d.fechaEmision ? fechaHoraBogota(new Date(d.fechaEmision)) : '',
      },
      adquirente: tieneDocumento
        ? {
            nombre: v.cliente!.nombre,
            identificacion: `${SIGLA_DOCUMENTO[v.cliente!.tipoDocumentoIdentidad!] ?? 'Doc.'} ${v.cliente!.documentoIdentidad}`,
          }
        : { nombre: 'Consumidor final', identificacion: 'CC 222222222222' },
      lineas: v.items.map((item) => {
        const base = Number(item.baseImponible);
        const iva = Number(item.impuesto);
        return {
          descripcion: item.nombreProducto,
          cantidad: String(Number(item.cantidad)),
          valorUnitario: formatearPesos(item.precioUnitario),
          base: formatearPesos(base),
          porcentajeIva: `${base > 0 ? Number(((iva / base) * 100).toFixed(2)) : 0}%`,
          iva: formatearPesos(iva),
          total: formatearPesos(base + iva),
        };
      }),
      totales: [
        { etiqueta: 'Subtotal', valor: formatearPesos(v.subtotal) },
        ...(Number(v.descuentoTotal) > 0 ? [{ etiqueta: 'Descuentos', valor: `-${formatearPesos(v.descuentoTotal)}` }] : []),
        { etiqueta: 'Base gravable', valor: formatearPesos(Number(v.subtotal) - Number(v.descuentoTotal)) },
        { etiqueta: 'IVA', valor: formatearPesos(v.impuestoTotal) },
        { etiqueta: 'Total a pagar', valor: formatearPesos(v.total) },
      ],
      pago: {
        forma: v.tipoVenta === 'CREDITO' ? 'Crédito' : 'Contado',
        medios: v.pagos.map((p) => `${p.metodoPago}: ${formatearPesos(p.monto)}`),
      },
      resolucion:
        `Numeración autorizada por la DIAN — Resolución No. ${d.resolucionNumero ?? '—'} del ${d.resolucionFechaInicio ?? '—'}, ` +
        `prefijo ${prefijo || '—'} del ${d.resolucionRangoDesde ?? '—'} al ${d.resolucionRangoHasta ?? '—'}, vigente hasta ${d.resolucionFechaFin ?? '—'}`,
      cufe: d.cufe ?? '',
      qrContenido: d.qrContenido ?? '',
      pie: [
        'Representación gráfica de la factura electrónica de venta',
        'Proveedor tecnológico: Alegra (NIT 900559088)',
        'Generada con AURA',
      ],
    };
  }

  async generar(datos: DatosFacturaPdf): Promise<Buffer> {
    const contenido = this.construirContenido(datos);
    const qr = await this.generarQrPng(contenido.qrContenido);
    return this.renderizar(contenido, qr, datos.logo);
  }

  /** Para mostrar el QR en pantalla (detalle) sin sumar una librería de QR al frontend. */
  generarQrDataUrl(contenido: string): Promise<string> {
    return QRCode.toDataURL(contenido, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
  }

  protected generarQrPng(contenido: string): Promise<Buffer> {
    return QRCode.toBuffer(contenido, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 300 });
  }

  private renderizar(c: ContenidoFacturaPdf, qr: Buffer, logo: Buffer | null): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: MARGEN, bufferPages: true, info: { Title: `Factura ${c.encabezado.numero}` } });
      const partes: Buffer[] = [];
      doc.on('data', (parte: Buffer) => partes.push(parte));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);

      this.dibujarEncabezado(doc, c, logo);
      this.dibujarAdquirente(doc, c);
      this.dibujarTabla(doc, c);
      this.dibujarTotalesYPago(doc, c);
      this.dibujarCufeYQr(doc, c, qr);

      if (c.marcaDeAgua) {
        const rango = doc.bufferedPageRange();
        for (let i = rango.start; i < rango.start + rango.count; i++) {
          doc.switchToPage(i);
          this.dibujarMarcaDeAgua(doc, c.marcaDeAgua);
        }
      }
      doc.end();
    });
  }

  private dibujarEncabezado(doc: PDFKit.PDFDocument, c: ContenidoFacturaPdf, logo: Buffer | null): void {
    const top = MARGEN;
    let xTexto = MARGEN;
    if (logo) {
      try {
        doc.image(logo, MARGEN, top, { fit: [90, 60] });
        xTexto = MARGEN + 100;
      } catch (error) {
        this.logger.warn(`Logo inválido, la factura se genera sin logo: ${(error as Error).message}`);
      }
    }
    const conLogo = xTexto > MARGEN;
    const anchoIzq = 290 - (xTexto - MARGEN);
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(conLogo ? 12 : 16).text(c.emisor.razonSocial, xTexto, top, { width: anchoIzq });
    doc.font('Helvetica').fontSize(8.5);
    doc.text(`NIT ${c.emisor.nitConDv}`, { width: anchoIzq });
    doc.text(c.emisor.regimen, { width: anchoIzq });
    if (c.emisor.direccion) doc.text(c.emisor.direccion, { width: anchoIzq });
    const finIzquierda = doc.y;

    const xDer = MARGEN + 300;
    const anchoDer = ANCHO - 300;
    doc.font('Helvetica-Bold').fontSize(10).text(c.encabezado.titulo, xDer, top, { width: anchoDer, align: 'right' });
    doc.fontSize(15).text(c.encabezado.numero, { width: anchoDer, align: 'right' });
    doc.font('Helvetica').fontSize(8.5).text(`Fecha y hora de emisión: ${c.encabezado.fechaEmision}`, { width: anchoDer, align: 'right' });

    doc.x = MARGEN;
    doc.y = Math.max(finIzquierda, doc.y, top + 64) + 14;
    this.linea(doc);
  }

  private dibujarAdquirente(doc: PDFKit.PDFDocument, c: ContenidoFacturaPdf): void {
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(9).text('Adquirente', MARGEN);
    doc.font('Helvetica').fontSize(9).text(`${c.adquirente.nombre} — ${c.adquirente.identificacion}`, MARGEN);
    doc.moveDown(0.8);
  }

  private dibujarCabeceraTabla(doc: PDFKit.PDFDocument): void {
    const y = doc.y;
    doc.rect(MARGEN, y - 3, ANCHO, 16).fill('#eef0f4').fillColor('#111');
    let x = MARGEN;
    doc.font('Helvetica-Bold').fontSize(8);
    for (const col of COLUMNAS) {
      doc.text(col.titulo, x + 3, y, { width: col.ancho - 6, align: col.align });
      x += col.ancho;
    }
    doc.y = y + 16;
  }

  private dibujarTabla(doc: PDFKit.PDFDocument, c: ContenidoFacturaPdf): void {
    this.dibujarCabeceraTabla(doc);
    doc.font('Helvetica').fontSize(8);
    const limite = doc.page.height - MARGEN - 40;
    for (const linea of c.lineas) {
      const alto = Math.max(doc.heightOfString(linea.descripcion, { width: COLUMNAS[0].ancho - 6 }), 10) + 6;
      if (doc.y + alto > limite) {
        doc.addPage();
        this.dibujarCabeceraTabla(doc);
        doc.font('Helvetica').fontSize(8);
      }
      const y = doc.y;
      let x = MARGEN;
      for (const col of COLUMNAS) {
        doc.text(linea[col.clave], x + 3, y, { width: col.ancho - 6, align: col.align });
        x += col.ancho;
      }
      doc.y = y + alto;
      doc.moveTo(MARGEN, doc.y - 2).lineTo(MARGEN + ANCHO, doc.y - 2).strokeColor('#e3e5ea').lineWidth(0.5).stroke();
    }
    doc.x = MARGEN;
    doc.moveDown(0.5);
  }

  private dibujarTotalesYPago(doc: PDFKit.PDFDocument, c: ContenidoFacturaPdf): void {
    this.asegurarEspacio(doc, 120);
    const yInicio = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).text('Forma de pago', MARGEN, yInicio);
    doc.font('Helvetica').fontSize(8.5).text(c.pago.forma, MARGEN);
    for (const medio of c.pago.medios) doc.text(medio, MARGEN, doc.y, { width: 260 });
    const finIzquierda = doc.y;

    let y = yInicio;
    for (const [i, total] of c.totales.entries()) {
      const esTotal = i === c.totales.length - 1;
      doc.font(esTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(esTotal ? 11 : 9);
      doc.text(total.etiqueta, MARGEN + 320, y, { width: 110 });
      doc.text(total.valor, MARGEN + 430, y, { width: ANCHO - 430, align: 'right' });
      y += esTotal ? 16 : 13;
    }
    doc.x = MARGEN;
    doc.y = Math.max(finIzquierda, y) + 10;
    this.linea(doc);
    doc.moveDown(0.5).font('Helvetica').fontSize(7.5).fillColor('#333').text(c.resolucion, MARGEN, doc.y, { width: ANCHO });
    doc.fillColor('#111').moveDown(0.8);
  }

  private dibujarCufeYQr(doc: PDFKit.PDFDocument, c: ContenidoFacturaPdf, qr: Buffer): void {
    this.asegurarEspacio(doc, 130);
    const y = doc.y;
    doc.image(qr, MARGEN, y, { width: 110, height: 110 });
    const x = MARGEN + 125;
    const ancho = ANCHO - 125;
    doc.font('Helvetica-Bold').fontSize(8.5).text('CUFE', x, y, { width: ancho });
    doc.font('Courier').fontSize(7.5).text(c.cufe, x, doc.y, { width: ancho });
    doc.moveDown(0.6).font('Helvetica').fontSize(8);
    for (const linea of c.pie) doc.text(linea, x, doc.y, { width: ancho });
    doc.x = MARGEN;
    doc.y = Math.max(doc.y, y + 115);
  }

  private dibujarMarcaDeAgua(doc: PDFKit.PDFDocument, texto: string): void {
    const { width, height } = doc.page;
    doc.save();
    doc.rotate(-35, { origin: [width / 2, height / 2] });
    doc.font('Helvetica-Bold').fontSize(34).fillColor('#c0392b').fillOpacity(0.14);
    doc.text(texto, 0, height / 2 - 20, { width, align: 'center', lineBreak: true });
    doc.restore();
    doc.fillOpacity(1).fillColor('#111');
  }

  private asegurarEspacio(doc: PDFKit.PDFDocument, alto: number): void {
    if (doc.y + alto > doc.page.height - MARGEN) doc.addPage();
  }

  private linea(doc: PDFKit.PDFDocument): void {
    doc.moveTo(MARGEN, doc.y).lineTo(MARGEN + ANCHO, doc.y).strokeColor('#c9ccd3').lineWidth(0.8).stroke();
  }
}
