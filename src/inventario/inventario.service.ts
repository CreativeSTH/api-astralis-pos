import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { Inventario } from './entities/inventario.entity';
import { MovimientoInventario } from './entities/movimiento-inventario.entity';
import { Producto } from '../productos/entities/producto.entity';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum';
import { AjustarStockDto } from './dto/ajustar-stock.dto';
import { SetStockMinimoDto } from './dto/set-stock-minimo.dto';
import { KardexQueryDto } from './dto/kardex-query.dto';
import { AlertasService } from '../alertas/alertas.service';
import { finDiaColombia, inicioDiaColombia } from '../common/utils/fecha-colombia';
import { Bodega } from '../bodegas/entities/bodega.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/enums/accion-auditoria.enum';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';

const ETIQUETA_TIPO_MOVIMIENTO: Partial<Record<TipoMovimientoInventario, string>> = {
  [TipoMovimientoInventario.ENTRADA]: 'Entrada',
  [TipoMovimientoInventario.SALIDA]: 'Salida',
  [TipoMovimientoInventario.AJUSTE]: 'Ajuste',
  [TipoMovimientoInventario.DEVOLUCION]: 'Devolución',
};

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
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
    private readonly alertasService: AlertasService,
    private readonly cls: ClsService,
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
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
      qb.andWhere('mov.created_at >= :desde', { desde: inicioDiaColombia(query.desde) });
    }
    if (query.hasta) {
      qb.andWhere('mov.created_at <= :hasta', { hasta: finDiaColombia(query.hasta) });
    }

    return qb.getMany();
  }

  /** No bloquea la operación de stock si falla — es una notificación, no una regla de negocio. */
  private async verificarStockPostAjuste(
    inventario: Inventario,
  ): Promise<void> {
    try {
      const producto = await this.productoRepository.findOne({
        where: { id: inventario.productoId },
      });
      if (producto) {
        await this.alertasService.verificarStockItem(
          inventario,
          producto.nombre,
        );
      }
    } catch {
      // no crítico — se recupera de todos modos en la próxima corrida del cron
    }
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
    const stockMinimoAnterior = inventario.stockMinimo;
    inventario.stockMinimo = dto.stockMinimo;
    const guardado = await this.inventarioRepository.save(inventario);
    if (Number(stockMinimoAnterior ?? 0) !== Number(dto.stockMinimo)) {
      const [producto, bodega] = await Promise.all([
        this.productoRepository.findOne({ where: { id: dto.productoId }, select: { id: true, nombre: true } }),
        this.dataSource.manager.findOne(Bodega, { where: { id: dto.bodegaId }, select: { id: true, nombre: true } }),
      ]);
      await this.auditoria.registrarAccion({
        modulo: ModuloPermiso.INVENTARIO,
        entidad: 'Producto',
        entidadId: dto.productoId,
        etiqueta: producto?.nombre ?? 'Producto',
        accion: AccionAuditoria.EDITAR,
        descripcion: `Cambió el stock mínimo de "${producto?.nombre ?? 'producto'}" en ${bodega?.nombre ?? 'bodega'}`,
        cambios: [
          {
            campo: 'stockMinimo',
            etiqueta: 'Stock mínimo',
            antes: stockMinimoAnterior === undefined || stockMinimoAnterior === null ? null : String(Number(stockMinimoAnterior)),
            despues: String(Number(dto.stockMinimo)),
          },
        ],
      });
    }
    return guardado;
  }

  /**
   * Único punto de entrada para mover stock. Lo usa tanto el endpoint manual
   * de ajuste como VentasService al confirmar una venta (tipo VENTA).
   */
  async ajustarStock(input: AjustarStockInput): Promise<Inventario> {
    const negocioId = this.getNegocioId();
    const usuarioId = this.getUsuarioId();

    const inventario = await this.dataSource.transaction(async (manager) => {
      const inventarioRepo = manager.getRepository(Inventario);

      // Lock pesimista: sin esto, dos ajustes concurrentes sobre el mismo producto/bodega pueden
      // leer el mismo stock antes de que ninguno confirme y los dos "ganan" (sobreventa o kardex
      // inconsistente) — no alcanza con la transacción sola bajo el aislamiento por defecto de
      // Postgres. Solo aplica a una fila ya existente: si es la primera vez que se registra stock
      // para este producto/bodega, el índice único (producto_id, bodega_id) sigue protegiendo
      // contra una inserción duplicada concurrente.
      let inventarioActual = await inventarioRepo.findOne({
        where: {
          negocioId,
          productoId: input.productoId,
          bodegaId: input.bodegaId,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inventarioActual) {
        inventarioActual = inventarioRepo.create({
          negocioId,
          productoId: input.productoId,
          bodegaId: input.bodegaId,
          cantidad: 0,
          stockMinimo: 0,
        });
      }

      const cantidadAnterior = Number(inventarioActual.cantidad);
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

      inventarioActual.cantidad = cantidadNueva;
      await inventarioRepo.save(inventarioActual);

      await manager.getRepository(MovimientoInventario).save(
        manager.getRepository(MovimientoInventario).create({
          negocioId,
          productoId: input.productoId,
          bodegaId: input.bodegaId,
          tipo: input.tipo,
          cantidad: deltaRegistrado,
          motivo: input.motivo,
          ventaId: input.ventaId,
          creadoPor: usuarioId,
        }),
      );

      // Las salidas por venta ya son historial de la venta; acá solo los movimientos manuales.
      if (!input.ventaId) {
        const [producto, bodega] = await Promise.all([
          manager.findOne(Producto, { where: { id: input.productoId }, select: { id: true, nombre: true } }),
          manager.findOne(Bodega, { where: { id: input.bodegaId }, select: { id: true, nombre: true } }),
        ]);
        const nombreBodega = bodega?.nombre ?? 'bodega';
        await this.auditoria.registrarAccion({
          manager,
          modulo: ModuloPermiso.INVENTARIO,
          entidad: 'Producto',
          entidadId: input.productoId,
          etiqueta: producto?.nombre ?? 'Producto',
          accion: AccionAuditoria.AJUSTAR,
          descripcion: `${ETIQUETA_TIPO_MOVIMIENTO[input.tipo] ?? input.tipo} de inventario de "${producto?.nombre ?? 'producto'}" en ${nombreBodega}${input.motivo ? ` — ${input.motivo}` : ''}`,
          cambios: [
            {
              campo: 'cantidad',
              etiqueta: `Stock en ${nombreBodega}`,
              antes: String(cantidadAnterior),
              despues: String(cantidadNueva),
            },
          ],
        });
      }

      return inventarioActual;
    });

    await this.verificarStockPostAjuste(inventario);
    return inventario;
  }
}
