import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { Cuota } from '../ventas/entities/cuota.entity';

export interface CobroItem {
  ventaId: string;
  clienteId: string | null;
  nombreCliente: string;
  telefonoCliente: string | null;
  cuota: {
    numero: number;
    monto: number;
    fechaVencimiento: string;
    saldoPendiente: number;
    diasMora: number;
    montoMora: number;
    montoTotalConMora: number;
  };
}

@Injectable()
export class CobrosService {
  constructor(
    @InjectRepository(Cuota)
    private readonly cuotaRepository: Repository<Cuota>,
    private readonly cls: ClsService,
  ) {}

  private getNegocioId(): string {
    return this.cls.get<string>('negocioId');
  }

  private baseQuery() {
    return this.cuotaRepository
      .createQueryBuilder('cuota')
      .leftJoinAndSelect('cuota.venta', 'venta')
      .leftJoinAndSelect('venta.cliente', 'cliente')
      .where('venta.negocio_id = :negocioId', {
        negocioId: this.getNegocioId(),
      });
  }

  private mapear(cuota: Cuota): CobroItem {
    return {
      ventaId: cuota.ventaId,
      clienteId: cuota.venta?.clienteId ?? null,
      nombreCliente: cuota.venta?.nombreCliente ?? 'Consumidor final',
      telefonoCliente: cuota.venta?.cliente?.telefono ?? null,
      cuota: {
        numero: cuota.numero,
        monto: Number(cuota.monto),
        fechaVencimiento: cuota.fechaVencimiento,
        saldoPendiente: Number(cuota.saldoPendiente),
        diasMora: cuota.diasMora,
        montoMora: Number(cuota.montoMora),
        montoTotalConMora: Number(cuota.montoTotalConMora),
      },
    };
  }

  async findAll(): Promise<CobroItem[]> {
    const cuotas = await this.baseQuery()
      .orderBy('cuota.fecha_vencimiento', 'ASC')
      .getMany();
    return cuotas.map((c) => this.mapear(c));
  }

  async pendientes(): Promise<CobroItem[]> {
    const cuotas = await this.baseQuery()
      .andWhere('cuota.pagada = false')
      .orderBy('cuota.fecha_vencimiento', 'ASC')
      .getMany();
    return cuotas.map((c) => this.mapear(c));
  }

  async pagados(): Promise<CobroItem[]> {
    const cuotas = await this.baseQuery()
      .andWhere('cuota.pagada = true')
      .orderBy('cuota.fecha_vencimiento', 'DESC')
      .getMany();
    return cuotas.map((c) => this.mapear(c));
  }

  async proximaQuincena(): Promise<CobroItem[]> {
    const hoy = new Date().toISOString().slice(0, 10);
    const en15Dias = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const cuotas = await this.baseQuery()
      .andWhere('cuota.pagada = false')
      .andWhere('cuota.fecha_vencimiento BETWEEN :hoy AND :en15Dias', {
        hoy,
        en15Dias,
      })
      .orderBy('cuota.fecha_vencimiento', 'ASC')
      .getMany();
    return cuotas.map((c) => this.mapear(c));
  }

  async vencidos(): Promise<CobroItem[]> {
    const hoy = new Date().toISOString().slice(0, 10);
    const cuotas = await this.baseQuery()
      .andWhere('cuota.pagada = false')
      .andWhere('cuota.fecha_vencimiento < :hoy', { hoy })
      .orderBy('cuota.fecha_vencimiento', 'ASC')
      .getMany();
    return cuotas.map((c) => this.mapear(c));
  }

  async porCliente(clienteId: string): Promise<CobroItem[]> {
    const cuotas = await this.baseQuery()
      .andWhere('venta.cliente_id = :clienteId', { clienteId })
      .orderBy('cuota.fecha_vencimiento', 'ASC')
      .getMany();
    return cuotas.map((c) => this.mapear(c));
  }

  async totales() {
    const hoy = new Date().toISOString().slice(0, 10);
    const pendientes = await this.baseQuery()
      .andWhere('cuota.pagada = false')
      .getMany();
    const vencidas = pendientes.filter((c) => c.fechaVencimiento < hoy);
    const clientesConDeuda = new Set(
      pendientes.map((c) => c.venta?.clienteId).filter(Boolean),
    );

    return {
      totalPendiente: pendientes.reduce(
        (sum, c) => sum + Number(c.saldoPendiente),
        0,
      ),
      totalVencido: vencidas.reduce(
        (sum, c) => sum + Number(c.saldoPendiente),
        0,
      ),
      totalMora: pendientes.reduce((sum, c) => sum + Number(c.montoMora), 0),
      cuotasPendientes: pendientes.length,
      cuotasVencidas: vencidas.length,
      clientesConDeuda: clientesConDeuda.size,
    };
  }
}
