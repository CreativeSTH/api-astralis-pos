import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { Traslado } from './entities/traslado.entity';
import { TrasladoItem } from './entities/traslado-item.entity';
import { CrearTrasladoDto } from './dto/crear-traslado.dto';
import { RecibirTrasladoDto } from './dto/recibir-traslado.dto';
import { FiltrosTrasladosDto } from './dto/filtros-traslados.dto';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { finDiaColombia, inicioDiaColombia } from '../common/utils/fecha-colombia';
import { etiquetaTraslado } from './traslado-etiqueta';
import { Bodega } from '../bodegas/entities/bodega.entity';
import { Producto } from '../productos/entities/producto.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
import { MovimientoInventario } from '../inventario/entities/movimiento-inventario.entity';
import { EstadoTraslado } from '../common/enums/estado-traslado.enum';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { AlertasService } from '../alertas/alertas.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/enums/accion-auditoria.enum';
import { PermisosService } from '../roles/permisos.service';

/** Inventarios que cambiaron + nombres de producto, para revisar alertas de stock después del commit. */
interface ResultadoMovimiento {
  traslado: Traslado;
  inventarios: Inventario[];
  nombres: Map<string, string>;
}

export type TrasladoDetalle = Traslado & {
  enviadoPorNombre: string | null;
  recibidoPorNombre: string | null;
  canceladoPorNombre: string | null;
};

/** Traslados entre bodegas en dos pasos: envío y recepción (spec 2026-10-04 §5-§7). */
@Injectable()
export class TrasladosService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cls: ClsService,
    private readonly alertas: AlertasService,
    private readonly auditoria: AuditoriaService,
    private readonly permisos: PermisosService,
  ) {}

  async listar(f: FiltrosTrasladosDto): Promise<Traslado[]> {
    const { negocioId } = this.contexto();
    const visibles = await this.bodegasVisibles(this.dataSource.manager);
    if (visibles && visibles.size === 0) return [];
    const qb = this.consultaBase(negocioId).orderBy('t.enviado_en', 'DESC');
    if (f.estado) qb.andWhere('t.estado = :estado', { estado: f.estado });
    if (f.bodegaId) {
      qb.andWhere('(t.bodega_origen_id = :bodegaId OR t.bodega_destino_id = :bodegaId)', { bodegaId: f.bodegaId });
    }
    if (visibles) {
      qb.andWhere('(t.bodega_origen_id IN (:...visibles) OR t.bodega_destino_id IN (:...visibles))', {
        visibles: [...visibles],
      });
    }
    if (f.desde) qb.andWhere('t.enviado_en >= :desde', { desde: inicioDiaColombia(f.desde) });
    if (f.hasta) qb.andWhere('t.enviado_en <= :hasta', { hasta: finDiaColombia(f.hasta) });
    return qb.getMany();
  }

  async detalle(id: string): Promise<TrasladoDetalle> {
    const { negocioId } = this.contexto();
    const traslado = await this.consultaBase(negocioId).andWhere('t.id = :id', { id }).getOne();
    if (!traslado) throw new NotFoundException('Traslado no encontrado');
    const visibles = await this.bodegasVisibles(this.dataSource.manager);
    if (visibles && !visibles.has(traslado.bodegaOrigenId) && !visibles.has(traslado.bodegaDestinoId)) {
      throw new NotFoundException('Traslado no encontrado');
    }
    const usuarioIds = [traslado.enviadoPor, traslado.recibidoPor, traslado.canceladoPor].filter((x): x is string => !!x);
    const usuarios = await this.dataSource.getRepository(Usuario).find({
      where: { id: In(usuarioIds) },
      select: { id: true, nombre: true },
    });
    const nombre = (uid: string | null) => (uid ? (usuarios.find((u) => u.id === uid)?.nombre ?? null) : null);
    return Object.assign(traslado, {
      enviadoPorNombre: nombre(traslado.enviadoPor),
      recibidoPorNombre: nombre(traslado.recibidoPor),
      canceladoPorNombre: nombre(traslado.canceladoPor),
    });
  }

  async enviar(dto: CrearTrasladoDto): Promise<Traslado> {
    const { negocioId, usuarioId } = this.contexto();
    if (dto.bodegaOrigenId === dto.bodegaDestinoId) {
      throw new BadRequestException('La bodega de origen y la de destino deben ser distintas');
    }
    const productoIds = dto.items.map((i) => i.productoId);
    if (new Set(productoIds).size !== productoIds.length) {
      throw new BadRequestException('Un producto aparece más de una vez en el traslado');
    }

    const resultado = await this.dataSource.transaction(async (manager): Promise<ResultadoMovimiento> => {
      const bodegas = await this.cargarBodegas(manager, negocioId, [dto.bodegaOrigenId, dto.bodegaDestinoId], true);
      const origen = bodegas.get(dto.bodegaOrigenId);
      const destino = bodegas.get(dto.bodegaDestinoId);
      if (!origen || !destino) {
        throw new BadRequestException('La bodega de origen o la de destino no existe o está inactiva');
      }
      const visibles = await this.bodegasVisibles(manager);
      if (visibles && !visibles.has(origen.id)) {
        throw new ForbiddenException('Solo puedes enviar desde una bodega de tu sucursal');
      }
      const nombres = await this.nombresProductos(manager, negocioId, productoIds);
      if (nombres.size !== productoIds.length) {
        throw new BadRequestException('Algún producto del traslado no existe en este negocio');
      }

      // Consecutivo por negocio: el lock sobre el negocio serializa los envíos concurrentes; el
      // índice único (negocio_id, consecutivo) es la red de seguridad.
      await manager.getRepository(Negocio).findOne({ where: { id: negocioId }, lock: { mode: 'pessimistic_write' } });
      const [{ max }] = await manager.query(
        'SELECT COALESCE(MAX(consecutivo), 0) AS max FROM traslados WHERE negocio_id = $1',
        [negocioId],
      );
      const consecutivo = Number(max) + 1;
      const etiqueta = etiquetaTraslado(consecutivo);

      const inventarioRepo = manager.getRepository(Inventario);
      const inventarios: Inventario[] = [];
      for (const item of dto.items) {
        const inventario = await inventarioRepo.findOne({
          where: { negocioId, productoId: item.productoId, bodegaId: origen.id },
          lock: { mode: 'pessimistic_write' },
        });
        const disponible = Number(inventario?.cantidad ?? 0);
        if (!inventario || disponible < item.cantidad) {
          throw new BadRequestException(
            `No hay stock suficiente de "${nombres.get(item.productoId)}" en ${origen.nombre} (disponible: ${disponible})`,
          );
        }
        inventario.cantidad = disponible - item.cantidad;
        inventarios.push(await inventarioRepo.save(inventario));
      }

      const trasladoRepo = manager.getRepository(Traslado);
      const traslado = await trasladoRepo.save(
        trasladoRepo.create({
          negocioId,
          consecutivo,
          bodegaOrigenId: origen.id,
          bodegaDestinoId: destino.id,
          estado: EstadoTraslado.EN_TRANSITO,
          nota: dto.nota?.trim() || null,
          enviadoPor: usuarioId,
          enviadoEn: new Date(),
          items: dto.items.map((i) => ({ productoId: i.productoId, cantidadEnviada: i.cantidad, cantidadRecibida: null })),
        }),
      );

      const kardex = manager.getRepository(MovimientoInventario);
      await kardex.save(
        dto.items.map((i) =>
          kardex.create({
            negocioId,
            productoId: i.productoId,
            bodegaId: origen.id,
            tipo: TipoMovimientoInventario.TRASLADO_SALIDA,
            cantidad: i.cantidad,
            motivo: `Traslado ${etiqueta} hacia ${destino.nombre}`,
            trasladoId: traslado.id,
            creadoPor: usuarioId,
          }),
        ),
      );

      await this.auditoria.registrarAccion({
        manager,
        modulo: ModuloPermiso.TRASLADOS,
        entidad: 'Traslado',
        entidadId: traslado.id,
        etiqueta,
        accion: AccionAuditoria.CREAR,
        descripcion: `Envió el traslado ${etiqueta} de ${origen.nombre} a ${destino.nombre} (${dto.items.length} producto${dto.items.length === 1 ? '' : 's'})`,
      });
      return { traslado, inventarios, nombres };
    });

    await this.revisarAlertas(resultado);
    return resultado.traslado;
  }

  async recibir(id: string, dto: RecibirTrasladoDto): Promise<Traslado> {
    const { negocioId, usuarioId } = this.contexto();
    const resultado = await this.dataSource.transaction(async (manager): Promise<ResultadoMovimiento> => {
      const traslado = await this.bloquearEnTransito(manager, id, negocioId);
      const etiqueta = etiquetaTraslado(traslado.consecutivo);
      const visibles = await this.bodegasVisibles(manager);
      if (visibles && !visibles.has(traslado.bodegaDestinoId)) {
        throw new ForbiddenException('Solo puedes recibir traslados que llegan a una bodega de tu sucursal');
      }

      const items = await manager.getRepository(TrasladoItem).find({ where: { trasladoId: id } });
      const recibidas = new Map(dto.items.map((i) => [i.productoId, i.cantidadRecibida]));
      if (
        recibidas.size !== dto.items.length ||
        recibidas.size !== items.length ||
        items.some((i) => !recibidas.has(i.productoId))
      ) {
        throw new BadRequestException('Indica la cantidad recibida de cada producto del traslado, una sola vez');
      }
      for (const item of items) {
        if (recibidas.get(item.productoId)! > Number(item.cantidadEnviada) + 1e-9) {
          throw new BadRequestException(
            'No puedes recibir más de lo enviado. Si llegó de más, regístralo con un ajuste de inventario.',
          );
        }
      }

      const bodegas = await this.cargarBodegas(manager, negocioId, [traslado.bodegaOrigenId, traslado.bodegaDestinoId], false);
      const origenNombre = bodegas.get(traslado.bodegaOrigenId)?.nombre ?? 'bodega de origen';
      const destinoNombre = bodegas.get(traslado.bodegaDestinoId)?.nombre ?? 'bodega de destino';
      const nombres = await this.nombresProductos(manager, negocioId, items.map((i) => i.productoId));

      const inventarioRepo = manager.getRepository(Inventario);
      const kardex = manager.getRepository(MovimientoInventario);
      const inventarios: Inventario[] = [];
      const movimientos: MovimientoInventario[] = [];
      let conFaltante = 0;
      for (const item of items) {
        const recibida = recibidas.get(item.productoId)!;
        item.cantidadRecibida = recibida;
        if (recibida > 0) {
          const inventario = await this.inventarioBloqueado(manager, negocioId, item.productoId, traslado.bodegaDestinoId);
          inventario.cantidad = Number(inventario.cantidad) + recibida;
          inventarios.push(await inventarioRepo.save(inventario));
          movimientos.push(
            kardex.create({
              negocioId,
              productoId: item.productoId,
              bodegaId: traslado.bodegaDestinoId,
              tipo: TipoMovimientoInventario.TRASLADO_ENTRADA,
              cantidad: recibida,
              motivo: `Traslado ${etiqueta} desde ${origenNombre}`,
              trasladoId: id,
              creadoPor: usuarioId,
            }),
          );
        }
        const faltante = Math.round((Number(item.cantidadEnviada) - recibida) * 100) / 100;
        if (faltante > 0) {
          conFaltante++;
          movimientos.push(
            kardex.create({
              negocioId,
              productoId: item.productoId,
              bodegaId: traslado.bodegaDestinoId,
              tipo: TipoMovimientoInventario.FALTANTE_TRASLADO,
              cantidad: faltante,
              motivo: `Traslado ${etiqueta} — no llegó`,
              trasladoId: id,
              creadoPor: usuarioId,
            }),
          );
        }
      }
      await manager.getRepository(TrasladoItem).save(items);
      await kardex.save(movimientos);

      traslado.estado = EstadoTraslado.RECIBIDO;
      traslado.recibidoPor = usuarioId;
      traslado.recibidoEn = new Date();
      const guardado = await manager.getRepository(Traslado).save(traslado);

      await this.auditoria.registrarAccion({
        manager,
        modulo: ModuloPermiso.TRASLADOS,
        entidad: 'Traslado',
        entidadId: id,
        etiqueta,
        accion: AccionAuditoria.REGISTRAR,
        descripcion:
          conFaltante > 0
            ? `Recibió el traslado ${etiqueta} en ${destinoNombre} con faltantes en ${conFaltante} producto${conFaltante === 1 ? '' : 's'}`
            : `Recibió el traslado ${etiqueta} completo en ${destinoNombre}`,
      });
      return { traslado: guardado, inventarios, nombres };
    });
    await this.revisarAlertas(resultado);
    return resultado.traslado;
  }

  async cancelar(id: string): Promise<Traslado> {
    const { negocioId, usuarioId } = this.contexto();
    const resultado = await this.dataSource.transaction(async (manager): Promise<ResultadoMovimiento> => {
      const traslado = await this.bloquearEnTransito(manager, id, negocioId);
      const etiqueta = etiquetaTraslado(traslado.consecutivo);
      const visibles = await this.bodegasVisibles(manager);
      if (visibles && !visibles.has(traslado.bodegaOrigenId)) {
        throw new ForbiddenException('Solo puedes cancelar traslados que salen de una bodega de tu sucursal');
      }
      const items = await manager.getRepository(TrasladoItem).find({ where: { trasladoId: id } });
      const nombres = await this.nombresProductos(manager, negocioId, items.map((i) => i.productoId));
      const inventarioRepo = manager.getRepository(Inventario);
      const kardex = manager.getRepository(MovimientoInventario);
      const inventarios: Inventario[] = [];
      for (const item of items) {
        const inventario = await this.inventarioBloqueado(manager, negocioId, item.productoId, traslado.bodegaOrigenId);
        inventario.cantidad = Number(inventario.cantidad) + Number(item.cantidadEnviada);
        inventarios.push(await inventarioRepo.save(inventario));
      }
      await kardex.save(
        items.map((item) =>
          kardex.create({
            negocioId,
            productoId: item.productoId,
            bodegaId: traslado.bodegaOrigenId,
            tipo: TipoMovimientoInventario.TRASLADO_CANCELADO,
            cantidad: Number(item.cantidadEnviada),
            motivo: `Traslado ${etiqueta} cancelado`,
            trasladoId: id,
            creadoPor: usuarioId,
          }),
        ),
      );
      traslado.estado = EstadoTraslado.CANCELADO;
      traslado.canceladoPor = usuarioId;
      traslado.canceladoEn = new Date();
      const guardado = await manager.getRepository(Traslado).save(traslado);
      await this.auditoria.registrarAccion({
        manager,
        modulo: ModuloPermiso.TRASLADOS,
        entidad: 'Traslado',
        entidadId: id,
        etiqueta,
        accion: AccionAuditoria.CANCELAR,
        descripcion: `Canceló el traslado ${etiqueta}; la mercancía volvió a la bodega de origen`,
      });
      return { traslado: guardado, inventarios, nombres };
    });
    await this.revisarAlertas(resultado);
    return resultado.traslado;
  }

  // ── privados ──

  /** Traslado con bodegas y productos, solo id y nombre de cada uno. */
  private consultaBase(negocioId: string) {
    return this.dataSource
      .getRepository(Traslado)
      .createQueryBuilder('t')
      .leftJoin('t.bodegaOrigen', 'origen')
      .addSelect(['origen.id', 'origen.nombre'])
      .leftJoin('t.bodegaDestino', 'destino')
      .addSelect(['destino.id', 'destino.nombre'])
      .leftJoinAndSelect('t.items', 'item')
      .leftJoin('item.producto', 'producto')
      .addSelect(['producto.id', 'producto.nombre'])
      .where('t.negocio_id = :negocioId', { negocioId });
  }

  /** Lock sobre el traslado: impide recibir dos veces, o recibir y cancelar a la vez. Sin relaciones (FOR UPDATE no admite LEFT JOIN). */
  private async bloquearEnTransito(manager: EntityManager, id: string, negocioId: string): Promise<Traslado> {
    const traslado = await manager.getRepository(Traslado).findOne({
      where: { id, negocioId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!traslado) throw new NotFoundException('Traslado no encontrado');
    if (traslado.estado !== EstadoTraslado.EN_TRANSITO) {
      throw new ConflictException(
        `El traslado ${etiquetaTraslado(traslado.consecutivo)} ya fue ${traslado.estado === EstadoTraslado.RECIBIDO ? 'recibido' : 'cancelado'}`,
      );
    }
    return traslado;
  }

  /** Fila de inventario con lock pesimista; si el producto nunca tuvo stock en esa bodega, la crea en 0. */
  private async inventarioBloqueado(
    manager: EntityManager,
    negocioId: string,
    productoId: string,
    bodegaId: string,
  ): Promise<Inventario> {
    const repo = manager.getRepository(Inventario);
    const inventario = await repo.findOne({
      where: { negocioId, productoId, bodegaId },
      lock: { mode: 'pessimistic_write' },
    });
    return inventario ?? repo.create({ negocioId, productoId, bodegaId, cantidad: 0, stockMinimo: 0 });
  }

  private contexto(): { negocioId: string; usuarioId: string } {
    return { negocioId: this.cls.get<string>('negocioId'), usuarioId: this.cls.get<string>('usuarioId') };
  }

  /**
   * null = ve y opera todo el negocio. Solo se restringe a quien NO puede enviar y tiene sucursal
   * asignada (spec 2026-10-04 §7): si no, un administrador con sucursal nunca podría despachar
   * desde el CEDI, que no pertenece a ninguna sucursal.
   */
  private async bodegasVisibles(manager: EntityManager): Promise<Set<string> | null> {
    const sucursalId = this.cls.get<string | null>('sucursalId');
    if (!sucursalId) return null;
    const puedeEnviar = await this.permisos.rolTienePermiso(
      this.cls.get<string>('rolId'),
      ModuloPermiso.TRASLADOS,
      AccionPermiso.CREAR,
    );
    if (puedeEnviar) return null;
    const filas: { bodega_id: string }[] = await manager.query(
      'SELECT sb.bodega_id FROM sucursal_bodegas sb JOIN bodegas b ON b.id = sb.bodega_id WHERE sb.sucursal_id = $1 AND b.negocio_id = $2',
      [sucursalId, this.contexto().negocioId],
    );
    return new Set(filas.map((f) => f.bodega_id));
  }

  private async cargarBodegas(
    manager: EntityManager,
    negocioId: string,
    ids: string[],
    soloActivas: boolean,
  ): Promise<Map<string, Bodega>> {
    const bodegas = await manager.getRepository(Bodega).find({
      where: { id: In(ids), negocioId, ...(soloActivas ? { activo: true } : {}) },
      select: { id: true, nombre: true },
    });
    return new Map(bodegas.map((b) => [b.id, b]));
  }

  private async nombresProductos(manager: EntityManager, negocioId: string, ids: string[]): Promise<Map<string, string>> {
    const productos = await manager.getRepository(Producto).find({
      where: { id: In(ids), negocioId },
      select: { id: true, nombre: true },
    });
    return new Map(productos.map((p) => [p.id, p.nombre]));
  }

  /** No bloquea la operación si falla — es una notificación (mismo criterio que InventarioService). */
  private async revisarAlertas({ inventarios, nombres }: ResultadoMovimiento): Promise<void> {
    for (const inventario of inventarios) {
      try {
        await this.alertas.verificarStockItem(inventario, nombres.get(inventario.productoId) ?? 'Producto');
      } catch {
        // se recupera en la próxima corrida del cron de alertas
      }
    }
  }
}
