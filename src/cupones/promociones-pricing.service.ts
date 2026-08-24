import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Promocion } from './entities/promocion.entity';
import { PromocionUso } from './entities/promocion-uso.entity';
import { TipoPromocion } from '../common/enums/tipo-promocion.enum';
import { TipoDescuento } from '../common/enums/tipo-descuento.enum';
import { Producto } from '../productos/entities/producto.entity';

export interface PrecioEfectivo {
  precio: number;
  precioOriginal?: number;
  promocionId?: string;
  promocionNombre?: string;
}

/**
 * Calcula el precio efectivo de un producto cuando alguna PROMOCION (tipo
 * automático, sin código) está vigente para él. Se usa tanto para el
 * catálogo del POS (mostrar "antes/ahora") como, con `manager`, dentro de
 * la transacción de una venta — nunca se confía en el precio que mande el
 * cliente, siempre se recalcula acá.
 */
@Injectable()
export class PromocionesPricingService {
  constructor(
    @InjectRepository(Promocion)
    private readonly promocionRepo: Repository<Promocion>,
    @InjectRepository(PromocionUso)
    private readonly usoRepo: Repository<PromocionUso>,
  ) {}

  async precioEfectivo(
    negocioId: string,
    sucursalId: string,
    bodegaId: string,
    producto: Producto,
    manager?: EntityManager,
  ): Promise<PrecioEfectivo> {
    const vigentes = await this.promocionesVigentes(negocioId, sucursalId, bodegaId, manager);
    const aplicables = vigentes.filter((p) => this.alcanzaProducto(p, producto));
    const precioOriginal = Number(producto.precioVenta);
    if (aplicables.length === 0) return { precio: precioOriginal };

    const elegida = this.masEspecifica(aplicables, precioOriginal);
    return {
      precio: this.aplicarDescuento(precioOriginal, elegida),
      precioOriginal,
      promocionId: elegida.id,
      promocionNombre: elegida.nombre,
    };
  }

  /** Mapa productoId → precio vigente, para pintar el catálogo del POS de una sola pasada. */
  async preciosVigentes(
    negocioId: string,
    sucursalId: string,
    bodegaId: string,
    productos: Producto[],
  ): Promise<Map<string, PrecioEfectivo & { precioOriginal: number; promocionId: string; promocionNombre: string }>> {
    const vigentes = await this.promocionesVigentes(negocioId, sucursalId, bodegaId);
    const resultado = new Map<
      string,
      PrecioEfectivo & { precioOriginal: number; promocionId: string; promocionNombre: string }
    >();
    if (vigentes.length === 0) return resultado;

    for (const producto of productos) {
      const aplicables = vigentes.filter((p) => this.alcanzaProducto(p, producto));
      if (aplicables.length === 0) continue;
      const precioOriginal = Number(producto.precioVenta);
      const elegida = this.masEspecifica(aplicables, precioOriginal);
      resultado.set(producto.id, {
        precio: this.aplicarDescuento(precioOriginal, elegida),
        precioOriginal,
        promocionId: elegida.id,
        promocionNombre: elegida.nombre,
      });
    }
    return resultado;
  }

  private async promocionesVigentes(
    negocioId: string,
    sucursalId: string,
    bodegaId: string,
    manager?: EntityManager,
  ): Promise<Promocion[]> {
    const repo = manager ? manager.getRepository(Promocion) : this.promocionRepo;
    const usoRepo = manager ? manager.getRepository(PromocionUso) : this.usoRepo;
    const ahora = new Date();

    const candidatas = await repo.find({
      where: { negocioId, tipo: TipoPromocion.PROMOCION, activo: true },
      relations: { sucursales: true, bodegas: true, categorias: true, productos: true },
    });

    const vigentes = candidatas.filter((p) => {
      if (p.fechaInicio && p.fechaInicio > ahora) return false;
      if (p.fechaFin && p.fechaFin < ahora) return false;
      if (p.sucursales.length > 0 && !p.sucursales.some((s) => s.id === sucursalId)) return false;
      if (p.bodegas.length > 0 && !p.bodegas.some((b) => b.id === bodegaId)) return false;
      return true;
    });

    return this.filtrarPorUsoDisponible(vigentes, usoRepo);
  }

  private async filtrarPorUsoDisponible(
    promos: Promocion[],
    usoRepo: Repository<PromocionUso>,
  ): Promise<Promocion[]> {
    const limitadas = promos.filter((p) => p.usoMaximo != null);
    if (limitadas.length === 0) return promos;

    const conteos = await usoRepo
      .createQueryBuilder('u')
      .select('u.promocion_id', 'promocionId')
      .addSelect('COUNT(*)', 'total')
      .where('u.promocion_id IN (:...ids)', { ids: limitadas.map((p) => p.id) })
      .groupBy('u.promocion_id')
      .getRawMany<{ promocionId: string; total: string }>();
    const usoPorId = new Map(conteos.map((c) => [c.promocionId, Number(c.total)]));
    const agotadasIds = new Set(
      limitadas.filter((p) => (usoPorId.get(p.id) ?? 0) >= p.usoMaximo!).map((p) => p.id),
    );
    return promos.filter((p) => !agotadasIds.has(p.id));
  }

  /** Producto específico > categoría específica > sin restricción. Empate → gana el mayor descuento. */
  private masEspecifica(promos: Promocion[], precioBase: number): Promocion {
    const puntuar = (p: Promocion): number => (p.productos.length > 0 ? 2 : p.categorias.length > 0 ? 1 : 0);
    return promos.reduce((mejor, actual) => {
      const puntoMejor = puntuar(mejor);
      const puntoActual = puntuar(actual);
      if (puntoActual !== puntoMejor) return puntoActual > puntoMejor ? actual : mejor;
      return this.aplicarDescuento(precioBase, actual) < this.aplicarDescuento(precioBase, mejor) ? actual : mejor;
    });
  }

  private alcanzaProducto(promocion: Promocion, producto: Producto): boolean {
    if (promocion.productos.length > 0) {
      return promocion.productos.some((p) => p.id === producto.id);
    }
    if (promocion.categorias.length > 0) {
      const idsCategoriasProducto = new Set((producto.categorias ?? []).map((c) => c.id));
      return promocion.categorias.some((c) => idsCategoriasProducto.has(c.id));
    }
    return true;
  }

  private aplicarDescuento(precioBase: number, promocion: Promocion): number {
    const descuento =
      promocion.tipoDescuento === TipoDescuento.PORCENTAJE
        ? precioBase * (Number(promocion.valor) / 100)
        : Number(promocion.valor);
    return Math.max(0, Number((precioBase - descuento).toFixed(2)));
  }
}
