import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';

export type FormatoCampo =
  | 'texto'
  | 'moneda'
  | 'porcentaje'
  | 'numero'
  | 'booleano'
  | 'fecha'
  | 'enum'
  | 'relacion'
  | 'relacionMultiple';

/** Clase de una entidad TypeORM (destino de una relación, o la entidad auditada). */
export type ClaseEntidad = abstract new (...args: never[]) => object;

export interface CampoAuditable {
  label: string;
  /** Default 'texto'. */
  formato?: FormatoCampo;
  /** formato 'enum': valor → etiqueta legible. */
  opciones?: Record<string, string>;
  /** formato 'relacion'/'relacionMultiple': clase destino (lazy, evita imports circulares). */
  entidad?: () => ClaseEntidad;
  /** Columna con el nombre legible en la entidad destino. Default 'nombre'. */
  campoEtiqueta?: string;
}

export interface OpcionesAuditable<T = any> {
  modulo: ModuloPermiso;
  /** Sustantivo para las descripciones: 'el producto', 'la categoría'. */
  nombre: string;
  etiqueta: (entidad: T) => string;
  /** Lista blanca: solo estos campos se comparan y se muestran. */
  campos: Record<string, CampoAuditable>;
  /** Campos sensibles: si cambian se registra '(cambiado)', nunca el valor. campo → label. */
  secretos?: Record<string, string>;
  /** Entidades sin columna negocioId (Negocio): de dónde sale. Default: `entidad.negocioId`. */
  negocioIdDe?: (entidad: T) => string | null | undefined;
}

export interface CambioAuditoria {
  campo: string;
  etiqueta: string;
  antes: string | null;
  despues: string | null;
}
