import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { Venta } from '../ventas/entities/venta.entity';
import { VentaPago } from '../ventas/entities/venta-pago.entity';
import { TurnoCaja } from '../caja/entities/turno-caja.entity';
import { EstadoVenta, TipoVenta } from '../common/enums/venta.enum';
import { EstadoTurnoCaja } from '../common/enums/caja.enum';
import { ReportesQueryDto } from './dto/reportes-query.dto';

interface RangoFechas {
  desde: Date;
  hasta: Date;
}

@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(Venta)
    private readonly ventasRepository: Repository<Venta>,
    @InjectRepository(VentaPago)
    private readonly ventaPagosRepository: Repository<VentaPago>,
    @InjectRepository(TurnoCaja)
    private readonly turnosRepository: Repository<TurnoCaja>,
    private readonly cls: ClsService,
  ) {}

  private getNegocioId(): string {
    return this.cls.get<string>('negocioId');
  }

  /**
   * Rango por defecto: últimos 30 días (inclusive), si el caller no especifica fechas.
   * Usa siempre métodos UTC: `desde`/`hasta` llegan como fechas sin hora (YYYY-MM-DD),
   * que `new Date()` parsea como medianoche UTC — mezclar eso con setHours() (hora local
   * del servidor) desplazaba el corte un día en zonas horarias negativas.
   */
  private rangoFechas(query: ReportesQueryDto): RangoFechas {
    const hasta = query.hasta ? new Date(query.hasta) : new Date();
    hasta.setUTCHours(23, 59, 59, 999);

    const desde = query.desde ? new Date(query.desde) : new Date(hasta);
    if (!query.desde) {
      desde.setUTCDate(desde.getUTCDate() - 30);
    }
    desde.setUTCHours(0, 0, 0, 0);

    return { desde, hasta };
  }

  private ventasQuery(query: ReportesQueryDto, rango: RangoFechas) {
    const qb = this.ventasRepository
      .createQueryBuilder('venta')
      .where('venta.negocio_id = :negocioId', {
        negocioId: this.getNegocioId(),
      })
      .andWhere('venta.created_at BETWEEN :desde AND :hasta', rango)
      .andWhere('venta.estado != :cancelada', {
        cancelada: EstadoVenta.CANCELADA,
      });

    if (query.sucursalId) {
      qb.andWhere('venta.sucursal_id = :sucursalId', {
        sucursalId: query.sucursalId,
      });
    }
    return qb;
  }

  async ventas(query: ReportesQueryDto) {
    const rango = this.rangoFechas(query);
    const ventas = await this.ventasQuery(query, rango).getMany();

    const totalVentas = ventas.length;
    const totalIngresos = ventas.reduce((acc, v) => acc + Number(v.total), 0);
    const totalDescuentos = ventas.reduce(
      (acc, v) => acc + Number(v.descuentoTotal),
      0,
    );
    const ticketPromedio = totalVentas > 0 ? totalIngresos / totalVentas : 0;

    const contado = ventas.filter((v) => v.tipoVenta === TipoVenta.CONTADO);
    const credito = ventas.filter((v) => v.tipoVenta === TipoVenta.CREDITO);

    const porDiaMap = new Map<
      string,
      { fecha: string; cantidad: number; total: number }
    >();
    for (const v of ventas) {
      const fecha = v.createdAt.toISOString().slice(0, 10);
      const entry = porDiaMap.get(fecha) ?? { fecha, cantidad: 0, total: 0 };
      entry.cantidad += 1;
      entry.total += Number(v.total);
      porDiaMap.set(fecha, entry);
    }
    const porDia = [...porDiaMap.values()].sort((a, b) =>
      a.fecha.localeCompare(b.fecha),
    );

    const pagosQb = this.ventaPagosRepository
      .createQueryBuilder('pago')
      .innerJoin('pago.venta', 'venta')
      .where('venta.negocio_id = :negocioId', {
        negocioId: this.getNegocioId(),
      })
      .andWhere('venta.created_at BETWEEN :desde AND :hasta', rango)
      .andWhere('venta.estado != :cancelada', {
        cancelada: EstadoVenta.CANCELADA,
      });
    if (query.sucursalId) {
      pagosQb.andWhere('venta.sucursal_id = :sucursalId', {
        sucursalId: query.sucursalId,
      });
    }
    const pagos = await pagosQb.getMany();

    const porMetodoPagoMap = new Map<string, number>();
    for (const p of pagos) {
      porMetodoPagoMap.set(
        p.metodoPago,
        (porMetodoPagoMap.get(p.metodoPago) ?? 0) + Number(p.monto),
      );
    }
    const porMetodoPago = [...porMetodoPagoMap.entries()]
      .map(([metodoPago, total]) => ({ metodoPago, total }))
      .sort((a, b) => b.total - a.total);

    return {
      desde: rango.desde,
      hasta: rango.hasta,
      totalVentas,
      totalIngresos,
      totalDescuentos,
      ticketPromedio,
      ventasContado: contado.length,
      totalContado: contado.reduce((acc, v) => acc + Number(v.total), 0),
      ventasCredito: credito.length,
      totalCredito: credito.reduce((acc, v) => acc + Number(v.total), 0),
      porDia,
      porMetodoPago,
    };
  }

  async margenes(query: ReportesQueryDto) {
    const rango = this.rangoFechas(query);
    const ventas = await this.ventasQuery(query, rango)
      .leftJoinAndSelect('venta.items', 'items')
      .getMany();

    const margenBrutoTotal = ventas.reduce(
      (acc, v) => acc + Number(v.margenBruto),
      0,
    );
    const costoTotal = ventas.reduce((acc, v) => acc + Number(v.costoTotal), 0);
    const ingresoTotal = ventas.reduce((acc, v) => acc + Number(v.total), 0);
    const porcentajeMargen =
      ingresoTotal > 0 ? (margenBrutoTotal / ingresoTotal) * 100 : 0;

    const productoMap = new Map<
      string,
      {
        productoId: string;
        nombreProducto: string;
        cantidadVendida: number;
        ingreso: number;
        margen: number;
      }
    >();
    for (const v of ventas) {
      for (const item of v.items ?? []) {
        const margenItem =
          Number(item.subtotal) -
          Number(item.costoUnitario) * Number(item.cantidad);
        const entry = productoMap.get(item.productoId) ?? {
          productoId: item.productoId,
          nombreProducto: item.nombreProducto,
          cantidadVendida: 0,
          ingreso: 0,
          margen: 0,
        };
        entry.cantidadVendida += Number(item.cantidad);
        entry.ingreso += Number(item.subtotal);
        entry.margen += margenItem;
        productoMap.set(item.productoId, entry);
      }
    }
    const topProductos = [...productoMap.values()]
      .sort((a, b) => b.margen - a.margen)
      .slice(0, 10);

    return {
      desde: rango.desde,
      hasta: rango.hasta,
      margenBrutoTotal,
      costoTotal,
      ingresoTotal,
      porcentajeMargen,
      topProductos,
    };
  }

  async cierresCaja(query: ReportesQueryDto) {
    const { desde, hasta } = this.rangoFechas(query);

    const qb = this.turnosRepository
      .createQueryBuilder('turno')
      .leftJoinAndSelect('turno.sucursal', 'sucursal')
      .leftJoinAndSelect('turno.usuarioApertura', 'usuarioApertura')
      .leftJoinAndSelect('turno.usuarioCierre', 'usuarioCierre')
      .where('turno.negocio_id = :negocioId', {
        negocioId: this.getNegocioId(),
      })
      .andWhere('turno.estado = :cerrado', { cerrado: EstadoTurnoCaja.CERRADO })
      .andWhere('turno.fecha_cierre BETWEEN :desde AND :hasta', {
        desde,
        hasta,
      })
      .orderBy('turno.fecha_cierre', 'DESC');

    if (query.sucursalId) {
      qb.andWhere('turno.sucursal_id = :sucursalId', {
        sucursalId: query.sucursalId,
      });
    }

    const turnos = await qb.getMany();

    const turnosConDescuadreSinPagar = turnos.filter(
      (t) => Number(t.diferencia ?? 0) !== 0 && !t.descuadrePagado,
    );
    const totalDiferencia = turnosConDescuadreSinPagar.reduce(
      (acc, t) => acc + Number(t.diferencia ?? 0),
      0,
    );
    const turnosConDescuadre = turnosConDescuadreSinPagar.length;

    return {
      desde,
      hasta,
      totalTurnos: turnos.length,
      totalDiferencia,
      turnosConDescuadre,
      turnos: turnos.map((t) => ({
        id: t.id,
        sucursalNombre: t.sucursal?.nombre ?? '—',
        fechaApertura: t.fechaApertura,
        fechaCierre: t.fechaCierre,
        usuarioAperturaNombre: t.usuarioApertura?.nombre ?? '—',
        usuarioCierreNombre: t.usuarioCierre?.nombre ?? '—',
        montoInicial: Number(t.montoInicial),
        montoContadoCierre:
          t.montoContadoCierre != null ? Number(t.montoContadoCierre) : null,
        montoEsperadoCierre:
          t.montoEsperadoCierre != null ? Number(t.montoEsperadoCierre) : null,
        diferencia: t.diferencia != null ? Number(t.diferencia) : null,
        descuadrePagado: t.descuadrePagado,
      })),
    };
  }
}
