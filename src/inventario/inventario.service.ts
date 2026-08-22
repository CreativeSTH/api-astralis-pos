import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { Inventario } from './entities/inventario.entity';
import { MovimientoInventario } from './entities/movimiento-inventario.entity';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum';
import { AjustarStockDto } from './dto/ajustar-stock.dto';
import { SetStockMinimoDto } from './dto/set-stock-minimo.dto';
import { KardexQueryDto } from './dto/kardex-query.dto';

interface AjustarStockInput extends AjustarStockDto {
  ventaId?: string;
}

@Injectable()
export class InventarioService {
  constructor(
    @InjectRepository(Inventario)
    private readonly inventarioRepository: Repository<Inventario>,
    @InjectRepository(MovimientoInventario)
    private readonly movimientoRepository: Repository<MovimientoInventario>,
    private readonly cls: ClsService,
  ) {}

  private getNegocioId(): string {
    return this.cls.get<string>('negocioId');
  }

  private getUsuarioId(): string | undefined {
    return this.cls.get<string>('usuarioId');
  }

  findAll(bodegaId?: string) {
    return this.inventarioRepository.find({
      where: bodegaId
        ? { negocioId: this.getNegocioId(), bodegaId }
        : { negocioId: this.getNegocioId() },
      relations: { producto: true, bodega: true },
    });
  }

  async bajoStock() {
    return this.inventarioRepository
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.producto', 'producto')
      .leftJoinAndSelect('inv.bodega', 'bodega')
      .where('inv.negocio_id = :negocioId', { negocioId: this.getNegocioId() })
      .andWhere('inv.stock_minimo > 0')
      .andWhere('inv.cantidad <= inv.stock_minimo')
      .getMany();
  }

  /** Historial de movimientos (kardex) — soporta filtro por producto, bodega y rango de fechas. */
  async kardex(query: KardexQueryDto): Promise<MovimientoInventario[]> {
    const qb = this.movimientoRepository
      .createQueryBuilder('mov')
      .leftJoinAndSelect('mov.producto', 'producto')
      .leftJoinAndSelect('mov.bodega', 'bodega')
      .where('mov.negocio_id = :negocioId', { negocioId: this.getNegocioId() })
      .orderBy('mov.created_at', 'DESC');

    if (query.productoId) {
      qb.andWhere('mov.producto_id = :productoId', {
        productoId: query.productoId,
      });
    }
    if (query.bodegaId) {
      qb.andWhere('mov.bodega_id = :bodegaId', { bodegaId: query.bodegaId });
    }
    if (query.desde) {
      qb.andWhere('mov.created_at >= :desde', { desde: new Date(query.desde) });
    }
    if (query.hasta) {
      const hasta = new Date(query.hasta);
      hasta.setUTCHours(23, 59, 59, 999);
      qb.andWhere('mov.created_at <= :hasta', { hasta });
    }

    return qb.getMany();
  }

  async setStockMinimo(dto: SetStockMinimoDto): Promise<Inventario> {
    const negocioId = this.getNegocioId();
    let inventario = await this.inventarioRepository.findOne({
      where: { negocioId, productoId: dto.productoId, bodegaId: dto.bodegaId },
    });
    if (!inventario) {
      inventario = this.inventarioRepository.create({
        negocioId,
        productoId: dto.productoId,
        bodegaId: dto.bodegaId,
        cantidad: 0,
      });
    }
    inventario.stockMinimo = dto.stockMinimo;
    return this.inventarioRepository.save(inventario);
  }

  /**
   * Único punto de entrada para mover stock. Lo usa tanto el endpoint manual
   * de ajuste como VentasService al confirmar una venta (tipo VENTA).
   */
  async ajustarStock(input: AjustarStockInput): Promise<Inventario> {
    const negocioId = this.getNegocioId();
    let inventario = await this.inventarioRepository.findOne({
      where: {
        negocioId,
        productoId: input.productoId,
        bodegaId: input.bodegaId,
      },
    });
    if (!inventario) {
      inventario = this.inventarioRepository.create({
        negocioId,
        productoId: input.productoId,
        bodegaId: input.bodegaId,
        cantidad: 0,
        stockMinimo: 0,
      });
    }

    const cantidadAnterior = Number(inventario.cantidad);
    let cantidadNueva: number;
    let deltaRegistrado: number;

    switch (input.tipo) {
      case TipoMovimientoInventario.ENTRADA:
      case TipoMovimientoInventario.DEVOLUCION:
        cantidadNueva = cantidadAnterior + input.cantidad;
        deltaRegistrado = input.cantidad;
        break;
      case TipoMovimientoInventario.SALIDA:
      case TipoMovimientoInventario.VENTA:
        cantidadNueva = cantidadAnterior - input.cantidad;
        if (cantidadNueva < 0) {
          throw new BadRequestException(
            'Stock insuficiente para completar la operación',
          );
        }
        deltaRegistrado = input.cantidad;
        break;
      case TipoMovimientoInventario.AJUSTE:
        cantidadNueva = input.cantidad;
        deltaRegistrado = input.cantidad - cantidadAnterior;
        break;
      default:
        throw new BadRequestException(
          'Tipo de movimiento de inventario no soportado',
        );
    }

    inventario.cantidad = cantidadNueva;
    await this.inventarioRepository.save(inventario);

    await this.movimientoRepository.save(
      this.movimientoRepository.create({
        negocioId,
        productoId: input.productoId,
        bodegaId: input.bodegaId,
        tipo: input.tipo,
        cantidad: deltaRegistrado,
        motivo: input.motivo,
        ventaId: input.ventaId,
        creadoPor: this.getUsuarioId(),
      }),
    );

    return inventario;
  }
}
