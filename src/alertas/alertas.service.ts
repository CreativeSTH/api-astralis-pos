import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { Alerta } from './entities/alerta.entity';
import { TipoAlerta, SeveridadAlerta } from '../common/enums/alerta.enum';
import { Cuota } from '../ventas/entities/cuota.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
import { EstadoVenta } from '../common/enums/venta.enum';

@Injectable()
export class AlertasService {
  constructor(
    @InjectRepository(Alerta)
    private readonly alertasRepository: Repository<Alerta>,
    @InjectRepository(Cuota)
    private readonly cuotasRepository: Repository<Cuota>,
    @InjectRepository(Venta)
    private readonly ventasRepository: Repository<Venta>,
    @InjectRepository(Cliente)
    private readonly clientesRepository: Repository<Cliente>,
    @InjectRepository(Inventario)
    private readonly inventarioRepository: Repository<Inventario>,
    private readonly cls: ClsService,
  ) {}

  private getNegocioId(): string {
    return this.cls.get<string>('negocioId');
  }

  findAll(
    filtros: {
      tipo?: TipoAlerta;
      severidad?: SeveridadAlerta;
      resuelta?: boolean;
    } = {},
  ) {
    const where: Record<string, unknown> = { negocioId: this.getNegocioId() };
    if (filtros.tipo !== undefined) where.tipo = filtros.tipo;
    if (filtros.severidad !== undefined) where.severidad = filtros.severidad;
    if (filtros.resuelta !== undefined) where.resuelta = filtros.resuelta;
    return this.alertasRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async resumen() {
    const alertas = await this.findAll();
    return {
      total: alertas.length,
      porSeveridad: {
        CRITICA: alertas.filter((a) => a.severidad === SeveridadAlerta.CRITICA)
          .length,
        ALTA: alertas.filter((a) => a.severidad === SeveridadAlerta.ALTA)
          .length,
        MEDIA: alertas.filter((a) => a.severidad === SeveridadAlerta.MEDIA)
          .length,
        BAJA: alertas.filter((a) => a.severidad === SeveridadAlerta.BAJA)
          .length,
      },
      activas: alertas.filter((a) => !a.resuelta).length,
      leidas: alertas.filter((a) => a.leida).length,
      resueltas: alertas.filter((a) => a.resuelta).length,
    };
  }

  async resolver(id: string): Promise<Alerta> {
    const alerta = await this.alertasRepository.findOne({
      where: { id, negocioId: this.getNegocioId() },
    });
    if (!alerta) {
      throw new NotFoundException(`Alerta con ID ${id} no encontrada`);
    }
    alerta.resuelta = true;
    return this.alertasRepository.save(alerta);
  }

  async marcarLeida(id: string): Promise<Alerta> {
    const alerta = await this.alertasRepository.findOne({
      where: { id, negocioId: this.getNegocioId() },
    });
    if (!alerta) {
      throw new NotFoundException(`Alerta con ID ${id} no encontrada`);
    }
    alerta.leida = true;
    return this.alertasRepository.save(alerta);
  }

  /** Genera/actualiza todas las alertas del negocio. Idempotente: no duplica alertas activas ya existentes. */
  async generar() {
    const negocioId = this.getNegocioId();
    let cuotasPorVencer = 0;
    let cuotasVencidas = 0;
    let clientesLimiteCredito = 0;
    let ventasEnMora = 0;

    const hoy = new Date();
    const hoyStr = hoy.toISOString().slice(0, 10);
    const en4Dias = new Date(hoy.getTime() + 4 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const cuotasPendientes = await this.cuotasRepository
      .createQueryBuilder('cuota')
      .leftJoinAndSelect('cuota.venta', 'venta')
      .where('venta.negocio_id = :negocioId', { negocioId })
      .andWhere('cuota.pagada = false')
      .getMany();

    for (const cuota of cuotasPendientes) {
      if (cuota.fechaVencimiento < hoyStr) {
        const dias = Math.floor(
          (hoy.getTime() - new Date(cuota.fechaVencimiento).getTime()) /
            86400000,
        );
        const severidad =
          dias > 30
            ? SeveridadAlerta.CRITICA
            : dias > 15
              ? SeveridadAlerta.ALTA
              : SeveridadAlerta.MEDIA;
        await this.upsert(
          negocioId,
          TipoAlerta.CUOTA_VENCIDA,
          cuota.id,
          severidad,
          `Cuota ${cuota.numero} de "${cuota.venta.nombreCliente}" vencida hace ${dias} día(s)`,
        );
        cuotasVencidas++;
      } else if (cuota.fechaVencimiento <= en4Dias) {
        const dias = Math.ceil(
          (new Date(cuota.fechaVencimiento).getTime() - hoy.getTime()) /
            86400000,
        );
        const severidad =
          dias <= 2 ? SeveridadAlerta.ALTA : SeveridadAlerta.MEDIA;
        await this.upsert(
          negocioId,
          TipoAlerta.CUOTA_POR_VENCER,
          cuota.id,
          severidad,
          `Cuota ${cuota.numero} de "${cuota.venta.nombreCliente}" vence en ${dias} día(s)`,
        );
        cuotasPorVencer++;
      }
    }

    const clientes = await this.clientesRepository.find({
      where: { negocioId, activo: true },
    });
    for (const cliente of clientes) {
      if (Number(cliente.limiteCredito) <= 0) continue;
      const porcentaje =
        Number(cliente.deudaActual) / Number(cliente.limiteCredito);
      if (porcentaje >= 0.8) {
        const severidad =
          porcentaje >= 1
            ? SeveridadAlerta.CRITICA
            : porcentaje >= 0.95
              ? SeveridadAlerta.ALTA
              : SeveridadAlerta.MEDIA;
        await this.upsert(
          negocioId,
          TipoAlerta.CLIENTE_LIMITE_CREDITO,
          cliente.id,
          severidad,
          `${cliente.nombre} está usando ${(porcentaje * 100).toFixed(0)}% de su cupo de crédito`,
        );
        clientesLimiteCredito++;
      }
    }

    const ventasEnMoraList = await this.ventasRepository.find({
      where: { negocioId, estado: EstadoVenta.EN_MORA },
    });
    for (const venta of ventasEnMoraList) {
      await this.upsert(
        negocioId,
        TipoAlerta.VENTA_EN_MORA,
        venta.id,
        SeveridadAlerta.CRITICA,
        `Venta de "${venta.nombreCliente}" en mora — total ${venta.total}`,
      );
      ventasEnMora++;
    }

    const inventarioBajo = await this.inventarioRepository
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.producto', 'producto')
      .where('inv.negocio_id = :negocioId', { negocioId })
      .andWhere('inv.stock_minimo > 0')
      .andWhere('inv.cantidad <= inv.stock_minimo')
      .getMany();
    for (const item of inventarioBajo) {
      await this.upsert(
        negocioId,
        TipoAlerta.STOCK_BAJO,
        item.id,
        item.cantidad <= 0 ? SeveridadAlerta.CRITICA : SeveridadAlerta.MEDIA,
        `Stock bajo de "${item.producto?.nombre}": quedan ${item.cantidad}`,
      );
    }

    return {
      cuotasPorVencer,
      cuotasVencidas,
      clientesLimiteCredito,
      ventasEnMora,
      stockBajo: inventarioBajo.length,
      total:
        cuotasPorVencer +
        cuotasVencidas +
        clientesLimiteCredito +
        ventasEnMora +
        inventarioBajo.length,
    };
  }

  private async upsert(
    negocioId: string,
    tipo: TipoAlerta,
    referenciaId: string,
    severidad: SeveridadAlerta,
    mensaje: string,
  ): Promise<void> {
    const existente = await this.alertasRepository.findOne({
      where: { negocioId, tipo, referenciaId, resuelta: false },
    });
    if (existente) {
      existente.severidad = severidad;
      existente.mensaje = mensaje;
      await this.alertasRepository.save(existente);
      return;
    }
    await this.alertasRepository.save(
      this.alertasRepository.create({
        negocioId,
        tipo,
        referenciaId,
        severidad,
        mensaje,
      }),
    );
  }
}
