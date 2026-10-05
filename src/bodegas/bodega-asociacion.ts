import { EntityManager } from 'typeorm';
import { Bodega } from './entities/bodega.entity';

/**
 * Única respuesta a "¿esta bodega es de esta sucursal?" (spec 2026-10-04 §3): activa, del negocio
 * y asociada a la sucursal en `sucursal_bodegas`. Un CEDI nunca lo está.
 */
export async function bodegaAsociadaASucursal(
  manager: EntityManager,
  negocioId: string,
  bodegaId: string,
  sucursalId: string,
): Promise<boolean> {
  const bodega = await manager.getRepository(Bodega).findOne({
    where: { id: bodegaId, negocioId, activo: true, sucursales: { id: sucursalId } },
    select: { id: true },
  });
  return bodega !== null;
}
