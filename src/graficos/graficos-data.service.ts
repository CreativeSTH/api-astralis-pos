import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { Venta } from '../ventas/entities/venta.entity';
import { VentaPago } from '../ventas/entities/venta-pago.entity';
import { MovimientoCaja } from '../caja/entities/movimiento-caja.entity';
import { TurnoCaja } from '../caja/entities/turno-caja.entity';
import { EstadoVenta, TipoVenta } from '../common/enums/venta.enum';
import { EstadoTurnoCaja, TipoMovimientoCaja } from '../common/enums/caja.enum';
import { FuenteDatoGrafico } from '../common/enums/fuente-dato-grafico.enum';

export interface DatoGrafico {
  x: string;
  y: number;
}

export interface FiltroFuenteDato {
  desde: Date;
  hasta: Date;
  sucursalId?: string;
  agrupacion: 'DIA' | 'SEMANA' | 'MES';
}

export interface FuenteDatoCatalogoItem {
  valor: FuenteDatoGrafico;
  etiqueta: string;
  tipoEje: 'FECHA' | 'CATEGORIA';
}

/** Fuente única de verdad de qué se puede graficar — alimenta el selector del wizard sin listas hardcodeadas en frontend. */
export const CATALOGO_FUENTES_DATO: FuenteDatoCatalogoItem[] = [
  { valor: FuenteDatoGrafico.VENTAS_TOTAL, etiqueta: 'Ventas totales', tipoEje: 'FECHA' },
  { valor: FuenteDatoGrafico.VENTAS_CONTADO, etiqueta: 'Ventas de contado', tipoEje: 'FECHA' },
  { valor: FuenteDatoGrafico.VENTAS_CREDITO, etiqueta: 'Ventas a crédito', tipoEje: 'FECHA' },
  { valor: FuenteDatoGrafico.INGRESOS, etiqueta: 'Ingresos de caja', tipoEje: 'FECHA' },
  { valor: FuenteDatoGrafico.EGRESOS, etiqueta: 'Egresos de caja', tipoEje: 'FECHA' },
  { valor: FuenteDatoGrafico.MARGEN_BRUTO, etiqueta: 'Margen bruto', tipoEje: 'FECHA' },
  { valor: FuenteDatoGrafico.METODOS_PAGO, etiqueta: 'Ventas por método de pago', tipoEje: 'CATEGORIA' },
  { valor: FuenteDatoGrafico.PRODUCTOS_TOP, etiqueta: 'Top 10 productos por ingreso', tipoEje: 'CATEGORIA' },
  { valor: FuenteDatoGrafico.CIERRES_CAJA_DIFERENCIA, etiqueta: 'Diferencia de cierres de caja', tipoEje: 'FECHA' },
];

/**
 * Registro de fuentes de datos graficables — cada `FuenteDatoGrafico` mapea a
 * un query builder que devuelve la misma forma unificada `{x,y}[]`. Vive
 * separado de `CajaService`/`VentasService` (operacionales) igual que
 * `ReportesService` ya está separado de ellos — esto es lectura agregada
 * para análisis, no una operación transaccional del POS.
 */
@Injectable()
export class GraficosDataService {
  constructor(
    @InjectRepository(Venta)
    private readonly ventasRepository: Repository<Venta>,
    @InjectRepository(VentaPago)
    private readonly ventaPagosRepository: Repository<VentaPago>,
    @InjectRepository(MovimientoCaja)
    private readonly movimientosRepository: Repository<MovimientoCaja>,
    @InjectRepository(TurnoCaja)
    private readonly turnosRepository: Repository<TurnoCaja>,
    private readonly cls: ClsService,
  ) {}

  private getNegocioId(): string {
    return this.cls.get<string>('negocioId');
  }

  catalogo(): FuenteDatoCatalogoItem[] {
    return CATALOGO_FUENTES_DATO;
  }

  async obtenerDatos(fuenteDato: FuenteDatoGrafico, filtro: FiltroFuenteDato): Promise<DatoGrafico[]> {
    switch (fuenteDato) {
      case FuenteDatoGrafico.VENTAS_TOTAL:
        return this.ventasPorFecha(filtro);
      case FuenteDatoGrafico.VENTAS_CONTADO:
        return this.ventasPorFecha(filtro, TipoVenta.CONTADO);
      case FuenteDatoGrafico.VENTAS_CREDITO:
        return this.ventasPorFecha(filtro, TipoVenta.CREDITO);
      case FuenteDatoGrafico.INGRESOS:
        return this.movimientosPorFecha(filtro, [TipoMovimientoCaja.VENTA, TipoMovimientoCaja.INGRESO]);
      case FuenteDatoGrafico.EGRESOS:
        return this.movimientosPorFecha(filtro, [TipoMovimientoCaja.EGRESO, TipoMovimientoCaja.RETIRO]);
      case FuenteDatoGrafico.MARGEN_BRUTO:
        return this.margenPorFecha(filtro);
      case FuenteDatoGrafico.METODOS_PAGO:
        return this.ventasPorMetodoPago(filtro);
      case FuenteDatoGrafico.PRODUCTOS_TOP:
        return this.productosTop(filtro);
      case FuenteDatoGrafico.CIERRES_CAJA_DIFERENCIA:
        return this.diferenciaCierres(filtro);
      default:
        return [];
    }
  }

  private claveAgrupacion(fecha: Date, agrupacion: FiltroFuenteDato['agrupacion']): string {
    if (agrupacion === 'MES') return fecha.toISOString().slice(0, 7);
    if (agrupacion === 'SEMANA') {
      const dia = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
      const diaSemana = dia.getUTCDay() || 7; // lunes=1 .. domingo=7
      dia.setUTCDate(dia.getUTCDate() - diaSemana + 1); // retrocede al lunes de esa semana
      return dia.toISOString().slice(0, 10);
    }
    return fecha.toISOString().slice(0, 10);
  }

  private agrupar(filas: { fecha: Date; valor: number }[], agrupacion: FiltroFuenteDato['agrupacion']): DatoGrafico[] {
    const mapa = new Map<string, number>();
    for (const fila of filas) {
      const clave = this.claveAgrupacion(fila.fecha, agrupacion);
      mapa.set(clave, (mapa.get(clave) ?? 0) + fila.valor);
    }
    return [...mapa.entries()].map(([x, y]) => ({ x, y })).sort((a, b) => a.x.localeCompare(b.x));
  }

  private async ventasPorFecha(filtro: FiltroFuenteDato, tipoVenta?: TipoVenta): Promise<DatoGrafico[]> {
    const qb = this.ventasRepository
      .createQueryBuilder('venta')
      .where('venta.negocio_id = :negocioId', { negocioId: this.getNegocioId() })
      .andWhere('venta.created_at BETWEEN :desde AND :hasta', { desde: filtro.desde, hasta: filtro.hasta })
      .andWhere('venta.estado != :cancelada', { cancelada: EstadoVenta.CANCELADA });
    if (filtro.sucursalId) qb.andWhere('venta.sucursal_id = :sucursalId', { sucursalId: filtro.sucursalId });
    if (tipoVenta) qb.andWhere('venta.tipo_venta = :tipoVenta', { tipoVenta });
    const ventas = await qb.getMany();
    return this.agrupar(
      ventas.map((v) => ({ fecha: v.createdAt, valor: Number(v.total) })),
      filtro.agrupacion,
    );
  }

  private async margenPorFecha(filtro: FiltroFuenteDato): Promise<DatoGrafico[]> {
    const qb = this.ventasRepository
      .createQueryBuilder('venta')
      .where('venta.negocio_id = :negocioId', { negocioId: this.getNegocioId() })
      .andWhere('venta.created_at BETWEEN :desde AND :hasta', { desde: filtro.desde, hasta: filtro.hasta })
      .andWhere('venta.estado != :cancelada', { cancelada: EstadoVenta.CANCELADA });
    if (filtro.sucursalId) qb.andWhere('venta.sucursal_id = :sucursalId', { sucursalId: filtro.sucursalId });
    const ventas = await qb.getMany();
    return this.agrupar(
      ventas.map((v) => ({ fecha: v.createdAt, valor: Number(v.margenBruto) })),
      filtro.agrupacion,
    );
  }

  private async movimientosPorFecha(filtro: FiltroFuenteDato, tipos: TipoMovimientoCaja[]): Promise<DatoGrafico[]> {
    const qb = this.movimientosRepository
      .createQueryBuilder('movimiento')
      .innerJoin('movimiento.turno', 'turno')
      .where('movimiento.negocio_id = :negocioId', { negocioId: this.getNegocioId() })
      .andWhere('movimiento.created_at BETWEEN :desde AND :hasta', { desde: filtro.desde, hasta: filtro.hasta })
      .andWhere('movimiento.tipo IN (:...tipos)', { tipos });
    if (filtro.sucursalId) qb.andWhere('turno.sucursal_id = :sucursalId', { sucursalId: filtro.sucursalId });
    const movimientos = await qb.getMany();
    return this.agrupar(
      movimientos.map((m) => ({ fecha: m.createdAt, valor: Number(m.monto) })),
      filtro.agrupacion,
    );
  }

  private async ventasPorMetodoPago(filtro: FiltroFuenteDato): Promise<DatoGrafico[]> {
    const qb = this.ventaPagosRepository
      .createQueryBuilder('pago')
      .innerJoin('pago.venta', 'venta')
      .where('venta.negocio_id = :negocioId', { negocioId: this.getNegocioId() })
      .andWhere('venta.created_at BETWEEN :desde AND :hasta', { desde: filtro.desde, hasta: filtro.hasta })
      .andWhere('venta.estado != :cancelada', { cancelada: EstadoVenta.CANCELADA });
    if (filtro.sucursalId) qb.andWhere('venta.sucursal_id = :sucursalId', { sucursalId: filtro.sucursalId });
    const pagos = await qb.getMany();
    const mapa = new Map<string, number>();
    for (const p of pagos) mapa.set(p.metodoPago, (mapa.get(p.metodoPago) ?? 0) + Number(p.monto));
    return [...mapa.entries()].map(([x, y]) => ({ x, y })).sort((a, b) => b.y - a.y);
  }

  private async productosTop(filtro: FiltroFuenteDato): Promise<DatoGrafico[]> {
    const qb = this.ventasRepository
      .createQueryBuilder('venta')
      .leftJoinAndSelect('venta.items', 'items')
      .where('venta.negocio_id = :negocioId', { negocioId: this.getNegocioId() })
      .andWhere('venta.created_at BETWEEN :desde AND :hasta', { desde: filtro.desde, hasta: filtro.hasta })
      .andWhere('venta.estado != :cancelada', { cancelada: EstadoVenta.CANCELADA });
    if (filtro.sucursalId) qb.andWhere('venta.sucursal_id = :sucursalId', { sucursalId: filtro.sucursalId });
    const ventas = await qb.getMany();
    const mapa = new Map<string, number>();
    for (const v of ventas) {
      for (const item of v.items ?? []) {
        mapa.set(item.nombreProducto, (mapa.get(item.nombreProducto) ?? 0) + Number(item.subtotal));
      }
    }
    return [...mapa.entries()]
      .map(([x, y]) => ({ x, y }))
      .sort((a, b) => b.y - a.y)
      .slice(0, 10);
  }

  private async diferenciaCierres(filtro: FiltroFuenteDato): Promise<DatoGrafico[]> {
    const qb = this.turnosRepository
      .createQueryBuilder('turno')
      .where('turno.negocio_id = :negocioId', { negocioId: this.getNegocioId() })
      .andWhere('turno.estado = :cerrado', { cerrado: EstadoTurnoCaja.CERRADO })
      .andWhere('turno.fecha_cierre BETWEEN :desde AND :hasta', { desde: filtro.desde, hasta: filtro.hasta });
    if (filtro.sucursalId) qb.andWhere('turno.sucursal_id = :sucursalId', { sucursalId: filtro.sucursalId });
    const turnos = await qb.getMany();
    return this.agrupar(
      turnos
        .filter((t) => t.fechaCierre)
        .map((t) => ({ fecha: t.fechaCierre as Date, valor: Number(t.diferencia ?? 0) })),
      filtro.agrupacion,
    );
  }
}
