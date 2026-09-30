import { ResolutionAlegra } from './alegra-client.service';
import { DocumentoElectronico } from './entities/documento-electronico.entity';
import { diaColombia } from '../common/utils/fecha-colombia';

/** La resolución CONGELADA en el documento (la de contingencia vigente al vender), no la actual de la habilitación. */
export function resolucionContingenciaDesdeDocumento(doc: DocumentoElectronico): ResolutionAlegra {
  return {
    prefix: doc.prefijo ?? '',
    resolutionNumber: doc.resolucionNumero ?? '',
    startDate: doc.resolucionFechaInicio ?? '',
    endDate: doc.resolucionFechaFin ?? '',
    minNumber: doc.resolucionRangoDesde ?? 0,
    maxNumber: doc.resolucionRangoHasta ?? 0,
    // El rango de talonario/papel no tiene clave técnica (anexo v1.9 §11.4, Nota-2); el catálogo de
    // Alanube exige el campo, y "" pasa `validate_co_payload` (2026-09-29).
    technicalKey: '',
  };
}

export interface DatosQrContingencia {
  numeroCompleto: string;
  fecha: Date;
  nitEmisor: string;
  documentoAdquirente: string;
  subtotal: number;
  iva: number;
  total: number;
}

/**
 * QR de la factura de papel generada por sistema (art. 1.5.1.2.2.2, num. 14). La norma lo exige pero no
 * define su contenido sin CUFE (ver "Sin confirmar" de la investigación de la fase 6): se usan las mismas
 * claves que el QR de la factura electrónica, sin CUFE. Al transmitirse, se reemplaza por el `qrCodeContent`
 * que devuelve Alegra.
 */
export function contenidoQrContingencia(d: DatosQrContingencia): string {
  const hora = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d.fecha);
  return [
    `NumFac: ${d.numeroCompleto}`,
    `FecFac: ${diaColombia(d.fecha)}`,
    `HorFac: ${hora}-05:00`,
    `NitFac: ${d.nitEmisor}`,
    `DocAdq: ${d.documentoAdquirente}`,
    `ValFac: ${d.subtotal.toFixed(2)}`,
    `ValIva: ${d.iva.toFixed(2)}`,
    `ValTolFac: ${d.total.toFixed(2)}`,
  ].join('\n');
}

/** Requisito num. 13 del art. 1.5.1.2.2.2 para la factura de papel generada por sistema. No es el emisor: ese es siempre el negocio. */
export function fabricanteSoftware(): string {
  const nombre = process.env.AURA_FABRICANTE_NOMBRE?.trim();
  const nit = process.env.AURA_FABRICANTE_NIT?.trim();
  return nombre && nit ? `Software: AURA — fabricante ${nombre} (NIT ${nit})` : 'Software: AURA';
}
