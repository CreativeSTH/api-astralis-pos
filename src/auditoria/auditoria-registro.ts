import { EntityManager, In } from 'typeorm';
import {
  CampoCambiado,
  construirCambios,
  descripcionAutomatica,
  idsRelacionados,
} from './auditoria-diff';
import { OpcionesAuditable } from './auditoria.types';
import { AccionAuditoria } from './enums/accion-auditoria.enum';
import type { DatosRegistro } from './auditoria.service';

export type FilaAuditable = Record<string, unknown> & {
  id?: string;
  negocioId?: string | null;
};

/** Nombres legibles de las relaciones que cambiaron, leídos en la misma transacción. */
export async function resolverEtiquetas(
  manager: EntityManager,
  campos: CampoCambiado[],
): Promise<Map<string, string>> {
  const etiquetas = new Map<string, string>();
  for (const [entidad, { campoEtiqueta, ids }] of idsRelacionados(campos)) {
    if (ids.size === 0) continue;
    const filas = (await manager.find(entidad(), {
      where: { id: In([...ids]) },
    })) as Record<string, unknown>[];
    for (const f of filas)
      etiquetas.set(
        String(f.id),
        String((f[campoEtiqueta] as string | undefined) ?? f.id),
      );
  }
  return etiquetas;
}

/** Registro listo para escribir, o null si la fila no pertenece a un negocio (tier SISTEMA). */
export function armarRegistro(
  opciones: OpcionesAuditable,
  target: unknown,
  fila: FilaAuditable,
  accion: AccionAuditoria,
  campos: CampoCambiado[],
  secretos: string[],
  etiquetas: Map<string, string>,
): DatosRegistro | null {
  const negocioId = opciones.negocioIdDe
    ? opciones.negocioIdDe(fila)
    : fila.negocioId;
  if (!negocioId || !fila.id) return null;
  const etiqueta = opciones.etiqueta(fila) || fila.id.slice(0, 8);
  return {
    negocioId,
    modulo: opciones.modulo,
    entidad: (target as { name: string }).name,
    entidadId: fila.id,
    entidadEtiqueta: etiqueta,
    accion,
    descripcion: descripcionAutomatica(accion, opciones.nombre, etiqueta),
    cambios:
      campos.length || secretos.length
        ? construirCambios(campos, secretos, opciones, etiquetas)
        : null,
  };
}
