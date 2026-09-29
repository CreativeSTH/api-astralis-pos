import { EstadoDocumentoElectronico } from '../facturacion-electronica/entities/estado-documento-electronico.enum';
import {
  finDiaColombia,
  inicioDiaColombia,
} from '../common/utils/fecha-colombia';

export type TipoComprobanteListado =
  'FACTURA_ELECTRONICA' | 'RECIBO' | 'FACTURA' | 'RECIBO_CAJA';

export interface FiltrosComprobantes {
  tipo?: TipoComprobanteListado;
  estadoDian?: EstadoDocumentoElectronico;
  /** 'YYYY-MM-DD', inclusive, día calendario Colombia. */
  desde?: string;
  hasta?: string;
  /** Número del comprobante o nombre del cliente. */
  q?: string;
}

export interface FilaComprobante {
  tipo: TipoComprobanteListado;
  numero: string | null;
  fecha: Date;
  cliente: string | null;
  total: number;
  estadoDian: EstadoDocumentoElectronico | null;
  ambiente: string | null;
  estadoVenta: string;
  ventaId: string;
  documentoId: string | null;
  abonoId: string | null;
}

export interface ResumenComprobantes {
  porTipo: Record<TipoComprobanteListado, number>;
  dian: { aceptados: number; pendientes: number; rechazados: number };
}

export interface ListadoComprobantes {
  items: FilaComprobante[];
  total: number;
  pagina: number;
  porPagina: number;
  resumen: ResumenComprobantes;
}

/**
 * Todos los comprobantes del negocio ($1) en una sola forma (spec 6.3): cada venta con su documento
 * electrónico más reciente (LATERAL: no hay índice único por venta y un LEFT JOIN duplicaría filas) y
 * cada abono con recibo de caja. `created_at`/`fecha` son timestamp sin zona en UTC → AT TIME ZONE 'UTC'
 * antes de mezclarlos con `fecha_emision` (timestamptz).
 */
export const SQL_COMPROBANTES = `
  SELECT
    CASE
      WHEN d.id IS NOT NULL THEN 'FACTURA_ELECTRONICA'
      WHEN v.tipo_comprobante_emitido::text = 'FACTURA' THEN 'FACTURA'
      ELSE 'RECIBO'
    END AS tipo,
    COALESCE(d.numero_completo, v.numero_comprobante) AS numero,
    COALESCE(d.fecha_emision, d.created_at AT TIME ZONE 'UTC', v.created_at AT TIME ZONE 'UTC') AS fecha,
    v.nombre_cliente AS cliente,
    v.total AS total,
    d.estado::text AS estado_dian,
    d.ambiente AS ambiente,
    v.estado::text AS estado_venta,
    v.id::text AS venta_id,
    d.id::text AS documento_id,
    NULL::text AS abono_id
  FROM ventas v
  LEFT JOIN LATERAL (
    SELECT de.id, de.numero_completo, de.fecha_emision, de.created_at, de.estado, de.ambiente
    FROM documentos_electronicos de
    WHERE de.venta_id = v.id::text AND de.negocio_id = v.negocio_id
    ORDER BY de.created_at DESC
    LIMIT 1
  ) d ON TRUE
  WHERE v.negocio_id = $1
  UNION ALL
  SELECT
    'RECIBO_CAJA', r.numero_recibo, r.fecha AT TIME ZONE 'UTC', v.nombre_cliente, r.monto,
    NULL, NULL, v.estado::text, v.id::text, NULL, r.id::text
  FROM registros_pago_cuota r
  JOIN cuotas cu ON cu.id = r.cuota_id
  JOIN ventas v ON v.id = cu.venta_id
  WHERE v.negocio_id = $1 AND r.numero_recibo IS NOT NULL
`;

/** WHERE sobre el alias `c` del SQL base; los parámetros se numeran desde $2 ($1 es el negocio). */
export function construirFiltros(
  f: FiltrosComprobantes,
  opciones: { incluirTipoYEstado: boolean } = { incluirTipoYEstado: true },
): { where: string; params: unknown[] } {
  const condiciones: string[] = [];
  const params: unknown[] = [];
  const agregar = (condicion: (p: string) => string, valor: unknown) => {
    params.push(valor);
    condiciones.push(condicion(`$${params.length + 1}`));
  };

  if (opciones.incluirTipoYEstado && f.tipo)
    agregar((p) => `c.tipo = ${p}`, f.tipo);
  if (opciones.incluirTipoYEstado && f.estadoDian)
    agregar((p) => `c.estado_dian = ${p}`, f.estadoDian);
  if (f.desde) agregar((p) => `c.fecha >= ${p}`, inicioDiaColombia(f.desde));
  if (f.hasta) agregar((p) => `c.fecha <= ${p}`, finDiaColombia(f.hasta));
  const q = f.q?.trim();
  if (q)
    agregar((p) => `(c.numero ILIKE ${p} OR c.cliente ILIKE ${p})`, `%${q}%`);

  return {
    where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
    params,
  };
}

export interface FilaCruda {
  tipo: TipoComprobanteListado;
  numero: string | null;
  fecha: Date;
  cliente: string | null;
  total: string | number;
  estado_dian: string | null;
  ambiente: string | null;
  estado_venta: string;
  venta_id: string;
  documento_id: string | null;
  abono_id: string | null;
}

export function mapearFila(raw: FilaCruda): FilaComprobante {
  return {
    tipo: raw.tipo,
    numero: raw.numero,
    fecha: raw.fecha,
    cliente: raw.cliente,
    total: Number(raw.total),
    estadoDian: raw.estado_dian as EstadoDocumentoElectronico | null,
    ambiente: raw.ambiente,
    estadoVenta: raw.estado_venta,
    ventaId: raw.venta_id,
    documentoId: raw.documento_id,
    abonoId: raw.abono_id,
  };
}

export function resumirConteos(
  conteos: {
    tipo: TipoComprobanteListado;
    estado_dian: string | null;
    cantidad: number | string;
  }[],
): ResumenComprobantes {
  const porTipo: Record<TipoComprobanteListado, number> = {
    FACTURA_ELECTRONICA: 0,
    RECIBO: 0,
    FACTURA: 0,
    RECIBO_CAJA: 0,
  };
  const dian = { aceptados: 0, pendientes: 0, rechazados: 0 };
  for (const { tipo, estado_dian, cantidad } of conteos) {
    const n = Number(cantidad);
    porTipo[tipo] += n;
    if (
      estado_dian === 'ACEPTADO' ||
      estado_dian === 'ACEPTADO_CON_OBSERVACIONES'
    )
      dian.aceptados += n;
    else if (estado_dian === 'PENDIENTE' || estado_dian === 'ERROR')
      dian.pendientes += n;
    else if (estado_dian === 'RECHAZADO') dian.rechazados += n;
  }
  return { porTipo, dian };
}
