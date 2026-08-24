import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Promocion } from './entities/promocion.entity';
import { PromocionUso } from './entities/promocion-uso.entity';
import { Producto } from '../productos/entities/producto.entity';
import { TipoPromocion } from '../common/enums/tipo-promocion.enum';
import { TipoDescuento } from '../common/enums/tipo-descuento.enum';
import { ValidarCuponDto } from './dto/validar-cupon.dto';

const MENSAJE_INVALIDO = 'El cupón ingresado no es válido';

export interface ContextoCupon {
  sucursalId: string;
  bodegaId: string;
  items: { productoId: string; cantidad: number; precioUnitario: number }[];
}

type Evaluacion = { ok: true; descuento: number } | { ok: false; motivo: string };

/**
 * Valida y redime cupones (tipo=CUPON). Se llama dos veces por cada cupón
 * usado en una venta: primero sin lock desde `POST /cupones/validar` (botón
 * "Redimir" del carrito, antes de cobrar), y otra vez CON lock pesimista
 * dentro de la transacción de `VentasService` — el descuento que calcula el
 * cliente nunca se usa para el total real, siempre se recalcula acá.
 */
@Injectable()
export class CuponValidacionService {
  constructor(
    @InjectRepository(Promocion)
    private readonly promocionRepo: Repository<Promocion>,
    @InjectRepository(PromocionUso)
    private readonly usoRepo: Repository<PromocionUso>,
    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,
  ) {}

  async validar(
    negocioId: string,
    dto: ValidarCuponDto,
  ): Promise<{ valido: boolean; descuento?: number; motivo?: string }> {
    const cupon = await this.promocionRepo.findOne({
      where: { negocioId, tipo: TipoPromocion.CUPON, codigo: dto.codigo },
      relations: { sucursales: true, bodegas: true, categorias: true, productos: true },
    });
    if (!cupon || !(await this.hayCupoDisponible(cupon, this.usoRepo))) {
      return { valido: false, motivo: MENSAJE_INVALIDO };
    }
    const resultado = await this.evaluar(cupon, negocioId, dto, this.productoRepo);
    if (!resultado.ok) return { valido: false, motivo: resultado.motivo };
    return { valido: true, descuento: resultado.descuento };
  }

  /** Re-valida con lock pesimista sobre la fila del cupón — evita que dos ventas concurrentes agoten el mismo cupón limitado. */
  async bloquearYValidar(
    manager: EntityManager,
    negocioId: string,
    codigo: string,
    contexto: ContextoCupon,
  ): Promise<{ promocion: Promocion; descuento: number }> {
    const repo = manager.getRepository(Promocion);
    const usoRepo = manager.getRepository(PromocionUso);
    const productoRepo = manager.getRepository(Producto);

    // Postgres no permite FOR UPDATE combinado con un LEFT JOIN de lado nullable — y `relations`
    // sobre las ManyToMany de Promocion genera justo eso. Se bloquea la fila sola primero (sin
    // relations, sin JOIN) y recién después se recarga con relations ya con el lock adquirido.
    const bloqueado = await repo.findOne({
      where: { negocioId, tipo: TipoPromocion.CUPON, codigo },
      lock: { mode: 'pessimistic_write' },
    });
    if (!bloqueado) throw new BadRequestException(MENSAJE_INVALIDO);

    const cupon = await repo.findOne({
      where: { id: bloqueado.id },
      relations: { sucursales: true, bodegas: true, categorias: true, productos: true },
    });
    if (!cupon || !(await this.hayCupoDisponible(cupon, usoRepo))) {
      throw new BadRequestException(MENSAJE_INVALIDO);
    }
    const resultado = await this.evaluar(cupon, negocioId, contexto, productoRepo);
    if (!resultado.ok) throw new BadRequestException(resultado.motivo);
    return { promocion: cupon, descuento: resultado.descuento };
  }

  async registrarUso(
    manager: EntityManager,
    promocionId: string,
    ventaId: string,
    negocioId: string,
    sucursalId: string,
    montoDescontado: number,
  ): Promise<void> {
    const usoRepo = manager.getRepository(PromocionUso);
    await usoRepo.save(
      usoRepo.create({ negocioId, promocionId, ventaId, sucursalId, montoDescontado }),
    );
  }

  private async hayCupoDisponible(cupon: Promocion, usoRepo: Repository<PromocionUso>): Promise<boolean> {
    if (!cupon.activo) return false;
    if (cupon.usoMaximo == null) return true;
    const usados = await usoRepo.count({ where: { promocionId: cupon.id } });
    return usados < cupon.usoMaximo;
  }

  private async evaluar(
    cupon: Promocion,
    negocioId: string,
    contexto: ContextoCupon,
    productoRepo: Repository<Producto>,
  ): Promise<Evaluacion> {
    const ahora = new Date();
    if (cupon.fechaInicio && cupon.fechaInicio > ahora) return { ok: false, motivo: MENSAJE_INVALIDO };
    if (cupon.fechaFin && cupon.fechaFin < ahora) return { ok: false, motivo: MENSAJE_INVALIDO };
    if (cupon.sucursales.length > 0 && !cupon.sucursales.some((s) => s.id === contexto.sucursalId)) {
      return { ok: false, motivo: MENSAJE_INVALIDO };
    }
    if (cupon.bodegas.length > 0 && !cupon.bodegas.some((b) => b.id === contexto.bodegaId)) {
      return { ok: false, motivo: MENSAJE_INVALIDO };
    }

    const subtotalTotal = contexto.items.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);
    if (cupon.montoMinimoCompra && subtotalTotal < Number(cupon.montoMinimoCompra)) {
      return {
        ok: false,
        motivo: `Esta compra no alcanza el monto mínimo de ${cupon.montoMinimoCompra} requerido por este cupón`,
      };
    }

    let baseDescuento = subtotalTotal;
    if (cupon.productos.length > 0 || cupon.categorias.length > 0) {
      const productos = await productoRepo.find({
        where: { id: In(contexto.items.map((i) => i.productoId)), negocioId },
        relations: { categorias: true },
      });
      const productoPorId = new Map(productos.map((p) => [p.id, p]));
      baseDescuento = contexto.items.reduce((acc, item) => {
        const producto = productoPorId.get(item.productoId);
        if (!producto) return acc;
        const alcanza =
          cupon.productos.length > 0
            ? cupon.productos.some((p) => p.id === producto.id)
            : cupon.categorias.some((c) => (producto.categorias ?? []).some((pc) => pc.id === c.id));
        return alcanza ? acc + item.cantidad * item.precioUnitario : acc;
      }, 0);
    }

    if (baseDescuento <= 0) return { ok: false, motivo: MENSAJE_INVALIDO };

    const descuento =
      cupon.tipoDescuento === TipoDescuento.PORCENTAJE
        ? baseDescuento * (Number(cupon.valor) / 100)
        : Math.min(Number(cupon.valor), baseDescuento);
    return { ok: true, descuento: Number(descuento.toFixed(2)) };
  }
}
