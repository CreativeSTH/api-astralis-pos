import { diaColombia } from '../common/utils/fecha-colombia';
import { AccionAuditoria } from './enums/accion-auditoria.enum';
import {
  CambioAuditoria,
  ClaseEntidad,
  CampoAuditable,
  FormatoCampo,
  OpcionesAuditable,
} from './auditoria.types';

/**
 * Lógica pura de la auditoría automática (spec §3): qué cambió, cómo se muestra y cómo se describe.
 * Sin TypeORM para poder testearla sola; el subscriber solo junta estado previo/nuevo y escribe.
 */

const CAMPOS_ACTIVO = new Set(['activo', 'activa']);
const NUMERICOS = new Set<FormatoCampo>(['moneda', 'numero', 'porcentaje']);
const FORMATO_NUMERO = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 2,
});

const vacio = (v: unknown) => v === null || v === undefined || v === '';

/** Texto de un valor escalar u objeto (jsonb) sin caer en '[object Object]'. */
const aTexto = (v: unknown): string =>
  typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);

export function idsDe(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((v: unknown) =>
      typeof v === 'string' ? v : (v as { id?: string } | null)?.id,
    )
    .filter((id): id is string => !!id);
}

/** Representación canónica para comparar antes/después sin falsos positivos ('10000.00' vs 10000). */
export function valorComparable(
  valor: unknown,
  formato: FormatoCampo = 'texto',
): string | null {
  if (formato === 'relacionMultiple') return idsDe(valor).sort().join(',');
  if (vacio(valor)) return null;
  if (NUMERICOS.has(formato)) return String(Number(valor));
  if (formato === 'booleano') return String(Boolean(valor));
  if (formato === 'fecha')
    return new Date(valor as string | Date).toISOString();
  return aTexto(valor);
}

/** 'NO_RESPONSABLE' → 'No responsable': valor de enum sin etiqueta propia, pero legible. */
export function enumLegible(valor: string): string {
  const texto = valor.replace(/_/g, ' ').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function formatearMoneda(valor: number): string {
  return `${valor < 0 ? '-' : ''}$${FORMATO_NUMERO.format(Math.abs(valor))}`;
}

export function formatearValor(
  valor: unknown,
  campo: CampoAuditable,
  etiquetas: Map<string, string> = new Map(),
): string | null {
  const formato = campo.formato ?? 'texto';
  if (formato === 'relacionMultiple') {
    const nombres = idsDe(valor)
      .map((id) => etiquetas.get(id) ?? id.slice(0, 8))
      .sort((a, b) => a.localeCompare(b, 'es'));
    return nombres.length ? nombres.join(', ') : null;
  }
  if (vacio(valor)) return null;
  switch (formato) {
    case 'moneda':
      return formatearMoneda(Number(valor));
    case 'numero':
      return FORMATO_NUMERO.format(Number(valor));
    case 'porcentaje':
      return `${FORMATO_NUMERO.format(Number(valor))}%`;
    case 'booleano':
      return valor ? 'Sí' : 'No';
    case 'fecha': {
      const [anio, mes, dia] = diaColombia(
        new Date(valor as string | Date),
      ).split('-');
      return `${dia}/${mes}/${anio}`;
    }
    case 'enum':
      return campo.opciones?.[aTexto(valor)] ?? enumLegible(aTexto(valor));
    case 'relacion':
      return etiquetas.get(aTexto(valor)) ?? aTexto(valor).slice(0, 8);
    default:
      return aTexto(valor);
  }
}

export interface CampoCambiado {
  campo: string;
  config: CampoAuditable;
  antes: unknown;
  despues: unknown;
}

/** 'columnas' excluye las relaciones múltiples; 'relacionesMultiples' compara solo esas (y no secretos). */
export type FiltroCampos = 'todos' | 'columnas' | 'relacionesMultiples';

export function camposCambiados(
  opciones: OpcionesAuditable,
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
  filtro: FiltroCampos = 'todos',
): { campos: CampoCambiado[]; secretos: string[] } {
  const campos: CampoCambiado[] = [];
  for (const [campo, config] of Object.entries(opciones.campos)) {
    if (!(campo in despues)) continue;
    const esMultiple = config.formato === 'relacionMultiple';
    if (
      (filtro === 'columnas' && esMultiple) ||
      (filtro === 'relacionesMultiples' && !esMultiple)
    )
      continue;
    // Una relación múltiple sin cargar en el estado previo no se puede comparar: se omite.
    if (config.formato === 'relacionMultiple' && antes[campo] === undefined)
      continue;
    if (
      valorComparable(antes[campo], config.formato) !==
      valorComparable(despues[campo], config.formato)
    ) {
      campos.push({
        campo,
        config,
        antes: antes[campo],
        despues: despues[campo],
      });
    }
  }
  const secretos =
    filtro === 'relacionesMultiples'
      ? []
      : Object.keys(opciones.secretos ?? {}).filter(
          (campo) => campo in despues && antes[campo] !== despues[campo],
        );
  return { campos, secretos };
}

export function camposIniciales(
  opciones: OpcionesAuditable,
  entidad: Record<string, unknown>,
): CampoCambiado[] {
  return Object.entries(opciones.campos)
    .filter(
      ([campo, config]) =>
        !CAMPOS_ACTIVO.has(campo) &&
        valorComparable(entidad[campo], config.formato),
    )
    .map(([campo, config]) => ({
      campo,
      config,
      antes: null,
      despues: entidad[campo],
    }));
}

export function clasificarAccion(campos: CampoCambiado[]): AccionAuditoria {
  if (campos.length === 1 && CAMPOS_ACTIVO.has(campos[0].campo)) {
    return campos[0].despues
      ? AccionAuditoria.REACTIVAR
      : AccionAuditoria.DESACTIVAR;
  }
  return AccionAuditoria.EDITAR;
}

/** Ids a resolver por entidad destino, para mostrar nombres en vez de uuids. */
export function idsRelacionados(
  campos: CampoCambiado[],
): Map<() => ClaseEntidad, { campoEtiqueta: string; ids: Set<string> }> {
  const porEntidad = new Map<
    () => ClaseEntidad,
    { campoEtiqueta: string; ids: Set<string> }
  >();
  for (const { config, antes, despues } of campos) {
    if (
      !config.entidad ||
      (config.formato !== 'relacion' && config.formato !== 'relacionMultiple')
    )
      continue;
    const grupo = porEntidad.get(config.entidad) ?? {
      campoEtiqueta: config.campoEtiqueta ?? 'nombre',
      ids: new Set<string>(),
    };
    const ids =
      config.formato === 'relacion'
        ? [antes, despues].filter(
            (v): v is string => typeof v === 'string' && v !== '',
          )
        : [...idsDe(antes), ...idsDe(despues)];
    ids.forEach((id) => grupo.ids.add(id));
    porEntidad.set(config.entidad, grupo);
  }
  return porEntidad;
}

export function construirCambios(
  campos: CampoCambiado[],
  secretos: string[],
  opciones: OpcionesAuditable,
  etiquetas: Map<string, string>,
): CambioAuditoria[] {
  return [
    ...campos.map(({ campo, config, antes, despues }) => ({
      campo,
      etiqueta: config.label,
      antes: formatearValor(antes, config, etiquetas),
      despues: formatearValor(despues, config, etiquetas),
    })),
    ...secretos.map((campo) => ({
      campo,
      etiqueta: opciones.secretos![campo],
      antes: null,
      despues: '(cambiado)',
    })),
  ];
}

const VERBOS: Partial<Record<AccionAuditoria, string>> = {
  [AccionAuditoria.CREAR]: 'Creó',
  [AccionAuditoria.EDITAR]: 'Editó',
  [AccionAuditoria.DESACTIVAR]: 'Desactivó',
  [AccionAuditoria.REACTIVAR]: 'Reactivó',
  [AccionAuditoria.ELIMINAR]: 'Eliminó',
};

export function descripcionAutomatica(
  accion: AccionAuditoria,
  nombre: string,
  etiqueta: string,
): string {
  return `${VERBOS[accion] ?? accion} ${nombre} "${etiqueta}"`;
}
