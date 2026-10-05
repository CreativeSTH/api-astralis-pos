import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Venta } from '../ventas/entities/venta.entity';
import { VentaItem } from '../ventas/entities/venta-item.entity';
import { Cuota } from '../ventas/entities/cuota.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
import { MovimientoInventario } from '../inventario/entities/movimiento-inventario.entity';
import { MovimientoCaja } from '../caja/entities/movimiento-caja.entity';
import { TurnoCaja } from '../caja/entities/turno-caja.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { MovimientoSaldoCliente } from '../clientes/entities/movimiento-saldo-cliente.entity';
import {
  DocumentoElectronico,
  TIPOS_FACTURA_DE_VENTA,
} from '../facturacion-electronica/entities/documento-electronico.entity';
import { Devolucion } from './entities/devolucion.entity';
import { DevolucionItem } from './entities/devolucion-item.entity';
import { DevolucionReembolso } from './entities/devolucion-reembolso.entity';
import { CrearDevolucionDto } from './dto/crear-devolucion.dto';
import { FiltrosDevolucionesDto } from './dto/filtros-devoluciones.dto';
import {
  ajustarReembolsos,
  bloqueoPorFactura,
  calcularLineaDevuelta,
  ItemVendido,
  netosPorLinea,
  redondear2,
  repartirEnCuotas,
  validarSolicitud,
} from './devolucion.logic';
import { EstadoDevolucionVenta, EstadoVenta, TipoVenta } from '../common/enums/venta.enum';
import { EstadoTurnoCaja, TipoMovimientoCaja } from '../common/enums/caja.enum';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum';
import { TipoNumeracion } from '../common/enums/tipo-comprobante.enum';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { NumeracionComprobanteService } from '../facturacion/numeracion-comprobante.service';
import { AuthService } from '../auth/auth.service';
import { PermisosService } from '../roles/permisos.service';
import { CajaService } from '../caja/caja.service';
import { MetodosPagoService } from '../metodos-pago/metodos-pago.service';
import { FacturacionElectronicaService } from '../facturacion-electronica/facturacion-electronica.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { finDiaColombia, inicioDiaColombia } from '../common/utils/fecha-colombia';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/enums/accion-auditoria.enum';
import { formatearMoneda } from '../auditoria/auditoria-diff';

export interface LineaDevolvible {
  ventaItemId: string;
  productoId: string;
  nombreProducto: string;
  vendida: number;
  devuelta: number;
  disponible: number;
  precioUnitario: number;
  /** Lo que se reembolsa por unidad (con descuentos e IVA); el valor exacto lo calcula `crear`. */
  netoPorUnidad: number;
}

export interface Devolvible {
  ventaId: string;
  numeroVenta: string | null;
  lineas: LineaDevolvible[];
  saldoDeudaVenta: number;
  tieneCliente: boolean;
  efectivoDisponible: number | null;
  bloqueo: string | null;
}

/**
 * Devoluciones parciales o totales (spec 2026-10-02). Todo lo que mueve stock, caja, deuda y saldo a
 * favor ocurre en una sola transacción con lock sobre la venta; la nota crédito electrónica se pide
 * después, sin esperar (la devolución nunca depende de Alegra).
 */
@Injectable()
export class DevolucionesService {
  private readonly logger = new Logger(DevolucionesService.name);

  constructor(
    @InjectRepository(Venta) private readonly ventasRepository: Repository<Venta>,
    @InjectRepository(Devolucion) private readonly devolucionesRepository: Repository<Devolucion>,
    @InjectRepository(DevolucionItem) private readonly devolucionItemsRepository: Repository<DevolucionItem>,
    @InjectRepository(DocumentoElectronico) private readonly documentosRepository: Repository<DocumentoElectronico>,
    @InjectRepository(TurnoCaja) private readonly turnosRepository: Repository<TurnoCaja>,
    private readonly dataSource: DataSource,
    private readonly numeracion: NumeracionComprobanteService,
    private readonly authService: AuthService,
    private readonly permisos: PermisosService,
    private readonly cajaService: CajaService,
    private readonly metodosPagoService: MetodosPagoService,
    private readonly facturacionElectronica: FacturacionElectronicaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly cls: ClsService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private getNegocioId(): string {
    const negocioId = this.cls.get<string>('negocioId');
    if (!negocioId) throw new Error('negocioId no está presente en el contexto de la request. ¿Falta el TenantGuard?');
    return negocioId;
  }

  private getUsuarioId(): string {
    return this.cls.get<string>('usuarioId');
  }

  async devolvible(ventaId: string): Promise<Devolvible> {
    const negocioId = this.getNegocioId();
    const venta = await this.ventasRepository.findOne({
      where: { id: ventaId, negocioId },
      relations: { items: true, cuotas: true },
    });
    if (!venta) throw new NotFoundException('Venta no encontrada');

    const factura = await this.facturaDeVenta(venta.id, negocioId);
    const devueltas = await this.cantidadesDevueltas(venta.id);
    const netos = netosPorLinea(venta.items.map(itemVendido), Number(venta.descuentoTotal));
    const efectivoDisponible = await this.efectivoDisponible(this.turnosRepository, venta.sucursalId, negocioId);

    let bloqueo: string | null;
    if (venta.estado === EstadoVenta.CANCELADA) bloqueo = 'Esta venta está cancelada';
    else if (venta.estadoDevolucion === EstadoDevolucionVenta.TOTAL) bloqueo = 'Esta venta ya se devolvió completa';
    else bloqueo = bloqueoPorFactura(factura);

    return {
      ventaId: venta.id,
      numeroVenta: factura?.numeroCompleto ?? venta.numeroComprobante ?? null,
      lineas: venta.items.map((item) => {
        const vendida = Number(item.cantidad);
        const devuelta = devueltas.get(item.id) ?? 0;
        return {
          ventaItemId: item.id,
          productoId: item.productoId,
          nombreProducto: item.nombreProducto,
          vendida,
          devuelta,
          disponible: redondear2(vendida - devuelta),
          precioUnitario: Number(item.precioUnitario),
          netoPorUnidad: redondear2(netos.get(item.id)!.neto / vendida),
        };
      }),
      saldoDeudaVenta: venta.tipoVenta === TipoVenta.CREDITO ? saldoPendiente(venta.cuotas ?? []) : 0,
      tieneCliente: !!venta.clienteId,
      efectivoDisponible,
      bloqueo,
    };
  }

  async crear(dto: CrearDevolucionDto): Promise<Devolucion> {
    const negocioId = this.getNegocioId();
    const usuarioId = this.getUsuarioId();
    const autorizadoPor = await this.autorizar(negocioId, usuarioId, dto.pinAutorizacion);

    const resultado = await this.dataSource.transaction(async (manager) => {
      // Lock sobre la venta: dos devoluciones simultáneas de la misma venta se serializan
      // (sin relaciones: Postgres no permite FOR UPDATE sobre un LEFT JOIN).
      const venta = await manager.getRepository(Venta).findOne({
        where: { id: dto.ventaId, negocioId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!venta) throw new NotFoundException('Venta no encontrada');
      if (venta.estado === EstadoVenta.CANCELADA) throw new BadRequestException('Esta venta está cancelada');
      venta.items = await manager.getRepository(VentaItem).find({ where: { ventaId: venta.id } });
      venta.cuotas = await manager.getRepository(Cuota).find({ where: { ventaId: venta.id } });

      const factura = await this.facturaDeVenta(venta.id, negocioId, manager);
      const bloqueo = bloqueoPorFactura(factura);
      if (bloqueo) throw new BadRequestException(bloqueo);

      const devueltas = await this.cantidadesDevueltas(venta.id, manager);
      const esPrimeraDevolucion = devueltas.size === 0;
      const netos = netosPorLinea(venta.items.map(itemVendido), Number(venta.descuentoTotal));
      const turnoRepo = manager.getRepository(TurnoCaja);
      const turno = await turnoRepo.findOne({
        where: { negocioId, sucursalId: venta.sucursalId, estado: EstadoTurnoCaja.ABIERTO },
      });
      const efectivoDisponible = await this.efectivoDisponible(turnoRepo, venta.sucursalId, negocioId);

      // Valor de cada línea con redondeo acumulado: varias devoluciones suman exactamente lo pagado.
      const lineas = dto.items.map((solicitado) => {
        const item = venta.items.find((i) => i.id === solicitado.ventaItemId);
        if (!item) return { solicitado, item: undefined, valor: undefined };
        const neto = netos.get(item.id)!;
        const valor = calcularLineaDevuelta({
          item: itemVendido(item),
          netoLinea: neto.neto,
          descuentoVentaLinea: neto.descuentoVenta,
          devueltaPrevia: devueltas.get(item.id) ?? 0,
          cantidad: solicitado.cantidad,
        });
        return { solicitado, item, valor };
      });
      const total = redondear2(lineas.reduce((s, l) => s + (l.valor?.total ?? 0), 0));

      const saldoDeudaVenta = venta.tipoVenta === TipoVenta.CREDITO ? saldoPendiente(venta.cuotas) : 0;
      validarSolicitud({
        lineas: new Map(
          venta.items.map((i) => [i.id, { disponible: redondear2(Number(i.cantidad) - (devueltas.get(i.id) ?? 0)) }]),
        ),
        items: dto.items,
        total,
        reembolsos: dto.reembolsos,
        saldoDeudaVenta,
        tieneCliente: !!venta.clienteId,
        efectivoDisponible,
      });
      const reembolsos = ajustarReembolsos(dto.reembolsos, total, saldoDeudaVenta);

      const { numero, numeroFormateado } = await this.numeracion.siguienteNumero(
        manager,
        negocioId,
        venta.sucursalId,
        TipoNumeracion.DEVOLUCION,
      );

      const devolucionRepo = manager.getRepository(Devolucion);
      const devolucion = await devolucionRepo.save(
        devolucionRepo.create({
          negocioId,
          sucursalId: venta.sucursalId,
          ventaId: venta.id,
          turnoId: reembolsos.some((r) => r.forma === 'EFECTIVO') ? turno!.id : null,
          numero,
          numeroCompleto: numeroFormateado,
          motivo: dto.motivo.trim(),
          total,
          baseTotal: redondear2(lineas.reduce((s, l) => s + l.valor!.base, 0)),
          impuestoTotal: redondear2(lineas.reduce((s, l) => s + l.valor!.impuesto, 0)),
          descuentoVentaTotal: redondear2(lineas.reduce((s, l) => s + l.valor!.descuentoVenta, 0)),
          creadoPor: usuarioId,
          autorizadoPor,
          items: lineas.map(({ solicitado, item, valor }) =>
            manager.getRepository(DevolucionItem).create({
              ventaItemId: item!.id,
              productoId: item!.productoId,
              nombreProducto: item!.nombreProducto,
              cantidad: solicitado.cantidad,
              precioUnitario: Number(item!.precioUnitario),
              base: valor!.base,
              impuesto: valor!.impuesto,
              descuentoVenta: valor!.descuentoVenta,
              total: valor!.total,
              vuelveAInventario: solicitado.vuelveAInventario,
              motivoBaja: solicitado.vuelveAInventario ? null : solicitado.motivoBaja?.trim() || dto.motivo.trim(),
            }),
          ),
          reembolsos: reembolsos.map((r) => manager.getRepository(DevolucionReembolso).create(r)),
        }),
      );

      await this.moverInventario(manager, venta, devolucion, usuarioId);
      await this.aplicarReembolsos(manager, venta, devolucion, turno, usuarioId);

      const quedaTotal = venta.items.every((i) => {
        const ahora = dto.items.find((d) => d.ventaItemId === i.id)?.cantidad ?? 0;
        return redondear2((devueltas.get(i.id) ?? 0) + ahora) >= Number(i.cantidad);
      });
      const estadoDevolucion = quedaTotal ? EstadoDevolucionVenta.TOTAL : EstadoDevolucionVenta.PARCIAL;
      await manager.getRepository(Venta).update(venta.id, { estadoDevolucion });

      await this.auditoria.registrarAccion({
        manager,
        modulo: ModuloPermiso.DEVOLUCIONES,
        entidad: 'Venta',
        entidadId: venta.id,
        etiqueta: `Venta ${venta.numeroComprobante ?? venta.id.slice(0, 8)}`,
        accion: AccionAuditoria.REGISTRAR,
        descripcion: `Registró la devolución ${devolucion.numeroCompleto} por ${formatearMoneda(total)} — ${dto.motivo.trim()}${
          autorizadoPor !== usuarioId ? ' (autorizada con PIN)' : ''
        }`,
      });

      return { devolucion, factura, quedaTotal, esPrimeraDevolucion };
    });

    // Fuera de la transacción: la devolución ya está firme; la nota crédito nunca la bloquea (spec 3.8).
    if (resultado.factura) {
      this.facturacionElectronica
        .registrarNotaCredito(resultado.devolucion.id, negocioId, {
          quedaTotal: resultado.quedaTotal,
          esPrimeraDevolucion: resultado.esPrimeraDevolucion,
        })
        .catch((e: unknown) =>
          this.logger.error(
            `No se pudo registrar la nota crédito de la devolución ${resultado.devolucion.id}`,
            e instanceof Error ? e.stack : String(e),
          ),
        );
    }
    this.realtimeGateway.emitToNegocio(negocioId, 'devoluciones:cambio', resultado.devolucion);
    return resultado.devolucion;
  }

  async listar(f: FiltrosDevolucionesDto) {
    const negocioId = this.getNegocioId();
    const pagina = f.pagina ?? 1;
    const porPagina = f.porPagina ?? 20;
    const qb = this.devolucionesRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.reembolsos', 'r')
      .where('d.negocioId = :negocioId', { negocioId });
    if (f.desde) qb.andWhere('d.createdAt >= :desde', { desde: inicioDiaColombia(f.desde) });
    if (f.hasta) qb.andWhere('d.createdAt <= :hasta', { hasta: finDiaColombia(f.hasta) });
    if (f.sucursalId) qb.andWhere('d.sucursalId = :sucursalId', { sucursalId: f.sucursalId });
    if (f.forma) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM devolucion_reembolsos x WHERE x.devolucion_id = d.id AND x.forma = :forma)',
        { forma: f.forma },
      );
    }
    const [items, total] = await qb
      .orderBy('d.createdAt', 'DESC')
      .skip((pagina - 1) * porPagina)
      .take(porPagina)
      .getManyAndCount();
    return { items, total, pagina, porPagina };
  }

  async detalle(id: string): Promise<Devolucion & { notaCredito: DocumentoElectronico | null }> {
    const negocioId = this.getNegocioId();
    const devolucion = await this.devolucionesRepository.findOne({
      where: { id, negocioId },
      relations: { items: true, reembolsos: true },
    });
    if (!devolucion) throw new NotFoundException('Devolución no encontrada');
    const notaCredito = await this.documentosRepository.findOne({ where: { devolucionId: id, negocioId } });
    return Object.assign(devolucion, { notaCredito });
  }

  // ── privados ──

  /** Igual que cancelar venta: con el permiso, directo; sin él, PIN de alguien que lo tenga. */
  private async autorizar(negocioId: string, usuarioId: string, pin?: string): Promise<string> {
    const rolId = this.cls.get<string>('rolId');
    if (await this.permisos.rolTienePermiso(rolId, ModuloPermiso.DEVOLUCIONES, AccionPermiso.CREAR)) return usuarioId;
    if (!pin) throw new ForbiddenException('Se requiere el PIN de un usuario autorizado para hacer devoluciones');
    const autorizador = await this.authService.autorizarConPin(
      negocioId,
      pin,
      ModuloPermiso.DEVOLUCIONES,
      AccionPermiso.CREAR,
    );
    return autorizador.id;
  }

  private facturaDeVenta(ventaId: string, negocioId: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(DocumentoElectronico) : this.documentosRepository;
    return repo.findOne({ where: { ventaId, negocioId, tipo: In(TIPOS_FACTURA_DE_VENTA) } });
  }

  private async cantidadesDevueltas(ventaId: string, manager?: EntityManager): Promise<Map<string, number>> {
    const repo = manager ? manager.getRepository(DevolucionItem) : this.devolucionItemsRepository;
    const filas = await repo
      .createQueryBuilder('i')
      .innerJoin('i.devolucion', 'd')
      .select('i.ventaItemId', 'ventaItemId')
      .addSelect('SUM(i.cantidad)', 'cantidad')
      .where('d.ventaId = :ventaId', { ventaId })
      .groupBy('i.ventaItemId')
      .getRawMany<{ ventaItemId: string; cantidad: string }>();
    return new Map(filas.map((f) => [f.ventaItemId, Number(f.cantidad)]));
  }

  /** Efectivo esperado del turno abierto de la sucursal (los turnos son por sucursal); null sin turno. */
  private async efectivoDisponible(
    turnoRepo: Repository<TurnoCaja>,
    sucursalId: string,
    negocioId: string,
  ): Promise<number | null> {
    const turno = await turnoRepo.findOne({ where: { negocioId, sucursalId, estado: EstadoTurnoCaja.ABIERTO } });
    return turno ? (await this.cajaService.resumen(turno.id)).efectivoEsperado : null;
  }

  private async moverInventario(
    manager: EntityManager,
    venta: Venta,
    devolucion: Devolucion,
    usuarioId: string,
  ): Promise<void> {
    const inventarioRepo = manager.getRepository(Inventario);
    const kardexRepo = manager.getRepository(MovimientoInventario);
    for (const item of devolucion.items) {
      if (item.vuelveAInventario) {
        const inventario = await inventarioRepo.findOne({
          where: { negocioId: venta.negocioId, productoId: item.productoId, bodegaId: venta.bodegaId },
          lock: { mode: 'pessimistic_write' },
        });
        if (inventario) {
          inventario.cantidad = Number(inventario.cantidad) + Number(item.cantidad);
          await inventarioRepo.save(inventario);
        }
      }
      await kardexRepo.save(
        kardexRepo.create({
          negocioId: venta.negocioId,
          productoId: item.productoId,
          bodegaId: venta.bodegaId,
          tipo: item.vuelveAInventario ? TipoMovimientoInventario.DEVOLUCION : TipoMovimientoInventario.BAJA_DEVOLUCION,
          cantidad: item.cantidad,
          motivo: item.vuelveAInventario
            ? `Devolución ${devolucion.numeroCompleto}`
            : `Devolución ${devolucion.numeroCompleto} — no vuelve: ${item.motivoBaja}`,
          ventaId: venta.id,
          creadoPor: usuarioId,
        }),
      );
    }
  }

  private async aplicarReembolsos(
    manager: EntityManager,
    venta: Venta,
    devolucion: Devolucion,
    turno: TurnoCaja | null,
    usuarioId: string,
  ): Promise<void> {
    for (const r of devolucion.reembolsos) {
      const monto = Number(r.monto);
      if (r.forma === 'EFECTIVO') {
        // EGRESO ya resta del efectivo esperado del arqueo (CajaService.resumen).
        const efectivo = (await this.metodosPagoService.findAll()).find((m) => m.esEfectivo);
        const movRepo = manager.getRepository(MovimientoCaja);
        await movRepo.save(
          movRepo.create({
            negocioId: venta.negocioId,
            turnoId: turno!.id,
            tipo: TipoMovimientoCaja.EGRESO,
            monto,
            metodoPago: efectivo?.nombre,
            ventaId: venta.id,
            concepto: `Devolución ${devolucion.numeroCompleto}`,
            creadoPor: usuarioId,
          }),
        );
      } else if (r.forma === 'DESCUENTO_DEUDA') {
        const cuotaRepo = manager.getRepository(Cuota);
        const reparto = repartirEnCuotas(venta.cuotas, monto);
        for (const { cuotaId, aplicado } of reparto) {
          const cuota = venta.cuotas.find((c) => c.id === cuotaId)!;
          cuota.saldoPendiente = redondear2(Number(cuota.saldoPendiente) - aplicado);
          cuota.montoTotalConMora = redondear2(Number(cuota.montoTotalConMora) - aplicado);
          if (cuota.saldoPendiente <= 0) {
            cuota.pagada = true;
            cuota.fechaPago = new Date();
          }
          await cuotaRepo.save(cuota);
        }
        // En la misma transacción (ClientesService.ajustarDeuda usa su propio repositorio).
        // Lo que de verdad se aplicó a las cuotas (nunca más que su saldo).
        const aplicadoTotal = redondear2(reparto.reduce((s, r) => s + r.aplicado, 0));
        await manager
          .getRepository(Cliente)
          .decrement({ id: venta.clienteId!, negocioId: venta.negocioId }, 'deudaActual', aplicadoTotal);
        if (venta.cuotas.every((c) => c.pagada)) {
          await manager.getRepository(Venta).update(venta.id, { estado: EstadoVenta.COMPLETADA });
        }
      } else {
        await manager
          .getRepository(Cliente)
          .increment({ id: venta.clienteId!, negocioId: venta.negocioId }, 'saldoAFavor', monto);
        const movRepo = manager.getRepository(MovimientoSaldoCliente);
        await movRepo.save(
          movRepo.create({
            negocioId: venta.negocioId,
            clienteId: venta.clienteId!,
            tipo: 'ABONO_DEVOLUCION',
            monto,
            devolucionId: devolucion.id,
            ventaId: venta.id,
            creadoPor: usuarioId,
          }),
        );
      }
    }
  }
}

function itemVendido(i: VentaItem): ItemVendido {
  return {
    id: i.id,
    cantidad: Number(i.cantidad),
    precioUnitario: Number(i.precioUnitario),
    descuento: Number(i.descuento),
    baseImponible: Number(i.baseImponible),
    impuesto: Number(i.impuesto),
    subtotal: Number(i.subtotal),
  };
}

function saldoPendiente(cuotas: { saldoPendiente: number }[]): number {
  return redondear2(cuotas.reduce((s, c) => s + Number(c.saldoPendiente), 0));
}
