import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Not, Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { Alerta } from './entities/alerta.entity';
import { ReglaAlerta } from './entities/regla-alerta.entity';
import { TipoAlerta, SeveridadAlerta } from '../common/enums/alerta.enum';
import { TipoCondicionAlerta } from '../common/enums/condicion-alerta.enum';
import { CreateReglaAlertaDto } from './dto/create-regla-alerta.dto';
import { UpdateReglaAlertaDto } from './dto/update-regla-alerta.dto';
import { Cuota } from '../ventas/entities/cuota.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { ItemPedido } from '../lista-pedidos/entities/item-pedido.entity';
import { TurnoCaja } from '../caja/entities/turno-caja.entity';
import { EstadoVenta } from '../common/enums/venta.enum';
import { EstadoTurnoCaja } from '../common/enums/caja.enum';
import { EstadoItemPedido } from '../common/enums/estado-item-pedido.enum';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class AlertasService {
  constructor(
    @InjectRepository(Alerta)
    private readonly alertasRepository: Repository<Alerta>,
    @InjectRepository(ReglaAlerta)
    private readonly reglasRepository: Repository<ReglaAlerta>,
    @InjectRepository(Cuota)
    private readonly cuotasRepository: Repository<Cuota>,
    @InjectRepository(Venta)
    private readonly ventasRepository: Repository<Venta>,
    @InjectRepository(Cliente)
    private readonly clientesRepository: Repository<Cliente>,
    @InjectRepository(Inventario)
    private readonly inventarioRepository: Repository<Inventario>,
    @InjectRepository(Sucursal)
    private readonly sucursalesRepository: Repository<Sucursal>,
    @InjectRepository(ItemPedido)
    private readonly itemsPedidoRepository: Repository<ItemPedido>,
    @InjectRepository(TurnoCaja)
    private readonly turnosRepository: Repository<TurnoCaja>,
    private readonly cls: ClsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  private getNegocioId(): string {
    return this.cls.get<string>('negocioId');
  }

  findAll(
    filtros: {
      tipo?: TipoAlerta;
      severidad?: SeveridadAlerta;
      resuelta?: boolean;
      activa?: boolean;
    } = {},
  ) {
    const where: Record<string, unknown> = { negocioId: this.getNegocioId() };
    if (filtros.tipo !== undefined) where.tipo = filtros.tipo;
    if (filtros.severidad !== undefined) where.severidad = filtros.severidad;
    if (filtros.resuelta !== undefined) where.resuelta = filtros.resuelta;
    if (filtros.activa !== undefined) where.activa = filtros.activa;
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

  async alternarActiva(id: string, activa: boolean): Promise<Alerta> {
    const alerta = await this.alertasRepository.findOne({
      where: { id, negocioId: this.getNegocioId() },
    });
    if (!alerta) {
      throw new NotFoundException(`Alerta con ID ${id} no encontrada`);
    }
    alerta.activa = activa;
    return this.alertasRepository.save(alerta);
  }

  findReglas(): Promise<ReglaAlerta[]> {
    return this.reglasRepository.find({
      where: { negocioId: this.getNegocioId() },
      order: { createdAt: 'DESC' },
    });
  }

  crearRegla(dto: CreateReglaAlertaDto): Promise<ReglaAlerta> {
    return this.reglasRepository.save(
      this.reglasRepository.create({
        negocioId: this.getNegocioId(),
        nombre: dto.nombre,
        tipoCondicion: dto.tipoCondicion,
        parametros: { valor: dto.valor },
        severidad: dto.severidad,
        activa: dto.activa ?? true,
      }),
    );
  }

  async actualizarRegla(
    id: string,
    dto: UpdateReglaAlertaDto,
  ): Promise<ReglaAlerta> {
    const regla = await this.reglasRepository.findOne({
      where: { id, negocioId: this.getNegocioId() },
    });
    if (!regla) {
      throw new NotFoundException(`Regla con ID ${id} no encontrada`);
    }
    if (dto.nombre !== undefined) regla.nombre = dto.nombre;
    if (dto.tipoCondicion !== undefined)
      regla.tipoCondicion = dto.tipoCondicion;
    if (dto.valor !== undefined) regla.parametros = { valor: dto.valor };
    if (dto.severidad !== undefined) regla.severidad = dto.severidad;
    if (dto.activa !== undefined) regla.activa = dto.activa;
    return this.reglasRepository.save(regla);
  }

  async eliminarRegla(id: string): Promise<void> {
    const regla = await this.reglasRepository.findOne({
      where: { id, negocioId: this.getNegocioId() },
    });
    if (!regla) {
      throw new NotFoundException(`Regla con ID ${id} no encontrada`);
    }
    await this.reglasRepository.remove(regla);
  }

  /** Evalúa todas las reglas activas del negocio — parte del mismo barrido que `generar()`. */
  private async evaluarReglas(negocioId: string): Promise<number> {
    const reglas = await this.reglasRepository.find({
      where: { negocioId, activa: true },
    });
    let disparadas = 0;
    for (const regla of reglas) {
      const valor = Number(regla.parametros?.['valor'] ?? 0);
      if (valor <= 0) continue;
      switch (regla.tipoCondicion) {
        case TipoCondicionAlerta.LISTA_PEDIDOS_SIN_RESOLVER: {
          const limite = new Date(Date.now() - valor * 60 * 60 * 1000);
          const items = await this.itemsPedidoRepository.find({
            where: {
              negocioId,
              estado: Not(EstadoItemPedido.INGRESADO),
              createdAt: LessThan(limite),
            },
          });
          for (const item of items) {
            await this.upsert(
              negocioId,
              TipoAlerta.REGLA,
              item.id,
              regla.severidad,
              `${regla.nombre}: "${item.nombreProducto}" lleva más de ${valor}h sin resolverse en la lista de pedidos`,
              item.productoId,
              regla.id,
            );
            disparadas++;
          }
          break;
        }
        case TipoCondicionAlerta.TURNO_ABIERTO_MUCHO_TIEMPO: {
          const limite = new Date(Date.now() - valor * 60 * 60 * 1000);
          const turnos = await this.turnosRepository.find({
            where: {
              negocioId,
              estado: EstadoTurnoCaja.ABIERTO,
              fechaApertura: LessThan(limite),
            },
          });
          for (const turno of turnos) {
            await this.upsert(
              negocioId,
              TipoAlerta.REGLA,
              turno.id,
              regla.severidad,
              `${regla.nombre}: hay un turno de caja abierto hace más de ${valor}h`,
            );
            disparadas++;
          }
          break;
        }
        case TipoCondicionAlerta.DESCUADRE_SIN_PAGAR: {
          const limite = new Date(Date.now() - valor * 24 * 60 * 60 * 1000);
          const turnos = await this.turnosRepository
            .createQueryBuilder('turno')
            .where('turno.negocio_id = :negocioId', { negocioId })
            .andWhere('turno.estado = :estado', {
              estado: EstadoTurnoCaja.CERRADO,
            })
            .andWhere('turno.descuadre_pagado = false')
            .andWhere('turno.diferencia != 0')
            .andWhere('turno.fecha_cierre < :limite', { limite })
            .getMany();
          for (const turno of turnos) {
            await this.upsert(
              negocioId,
              TipoAlerta.REGLA,
              turno.id,
              regla.severidad,
              `${regla.nombre}: un turno cerrado hace más de ${valor} día(s) tiene un descuadre sin pagar`,
            );
            disparadas++;
          }
          break;
        }
      }
    }
    return disparadas;
  }

  /** Ventas de hoy por sucursal vs. `metaVentasDiaria` — solo se evalúa después de las 8pm para no avisar a mitad de día. */
  private async verificarMetaVentas(negocioId: string): Promise<number> {
    const HORA_CORTE = 20;
    if (new Date().getHours() < HORA_CORTE) return 0;

    const sucursales = await this.sucursalesRepository.find({
      where: { negocioId, activo: true },
    });
    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);

    let disparadas = 0;
    for (const sucursal of sucursales) {
      const meta = Number(sucursal.metaVentasDiaria ?? 0);
      if (meta <= 0) continue;

      const ventasHoy = await this.ventasRepository
        .createQueryBuilder('venta')
        .where('venta.negocio_id = :negocioId', { negocioId })
        .andWhere('venta.sucursal_id = :sucursalId', {
          sucursalId: sucursal.id,
        })
        .andWhere('venta.created_at >= :hoyInicio', { hoyInicio })
        .andWhere('venta.estado != :cancelada', {
          cancelada: EstadoVenta.CANCELADA,
        })
        .getMany();
      const totalHoy = ventasHoy.reduce((sum, v) => sum + Number(v.total), 0);

      if (totalHoy < meta) {
        await this.upsert(
          negocioId,
          TipoAlerta.META_VENTAS_NO_ALCANZADA,
          sucursal.id,
          SeveridadAlerta.MEDIA,
          `"${sucursal.nombre}" lleva $${totalHoy.toLocaleString('es-CO')} vendidos hoy — meta $${meta.toLocaleString('es-CO')}`,
        );
        disparadas++;
      }
    }
    return disparadas;
  }

  /** Alerta manual, creada desde la UI — no la toca `generar()` ni el cron. */
  async crear(dto: {
    severidad: SeveridadAlerta;
    mensaje: string;
    activa?: boolean;
  }): Promise<Alerta> {
    return this.alertasRepository.save(
      this.alertasRepository.create({
        negocioId: this.getNegocioId(),
        tipo: TipoAlerta.PERSONALIZADA,
        severidad: dto.severidad,
        mensaje: dto.mensaje,
        activa: dto.activa ?? true,
      }),
    );
  }

  /**
   * Chequeo puntual de UN registro de inventario — se llama justo después de
   * una venta o un ajuste manual de stock, para que la alerta de
   * stock-bajo/agotado aparezca de inmediato en vez de esperar hasta la
   * próxima corrida del cron (cada 30 min). No recibe `negocioId` desde CLS
   * a propósito: se llama tanto desde un request HTTP normal como, más
   * adelante, potencialmente desde otros contextos sin CLS poblado.
   */
  async verificarStockItem(
    inventario: Inventario,
    nombreProducto: string,
  ): Promise<void> {
    const cantidad = Number(inventario.cantidad);
    const stockMinimo = Number(inventario.stockMinimo);
    if (cantidad <= 0) {
      await this.upsert(
        inventario.negocioId,
        TipoAlerta.PRODUCTO_AGOTADO,
        inventario.id,
        SeveridadAlerta.CRITICA,
        `"${nombreProducto}" se quedó sin stock`,
        inventario.productoId,
      );
    } else if (stockMinimo > 0 && cantidad <= stockMinimo) {
      await this.upsert(
        inventario.negocioId,
        TipoAlerta.STOCK_BAJO,
        inventario.id,
        SeveridadAlerta.MEDIA,
        `Stock bajo de "${nombreProducto}": quedan ${cantidad}`,
        inventario.productoId,
      );
    }
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
      .andWhere(
        '((inv.stock_minimo > 0 AND inv.cantidad <= inv.stock_minimo) OR inv.cantidad <= 0)',
      )
      .getMany();
    for (const item of inventarioBajo) {
      if (Number(item.cantidad) <= 0) {
        await this.upsert(
          negocioId,
          TipoAlerta.PRODUCTO_AGOTADO,
          item.id,
          SeveridadAlerta.CRITICA,
          `"${item.producto?.nombre}" se quedó sin stock`,
          item.productoId,
        );
      } else {
        await this.upsert(
          negocioId,
          TipoAlerta.STOCK_BAJO,
          item.id,
          SeveridadAlerta.MEDIA,
          `Stock bajo de "${item.producto?.nombre}": quedan ${item.cantidad}`,
          item.productoId,
        );
      }
    }

    const metaVentas = await this.verificarMetaVentas(negocioId);
    const reglasDisparadas = await this.evaluarReglas(negocioId);

    return {
      cuotasPorVencer,
      cuotasVencidas,
      clientesLimiteCredito,
      ventasEnMora,
      stockBajo: inventarioBajo.length,
      metaVentas,
      reglasDisparadas,
      total:
        cuotasPorVencer +
        cuotasVencidas +
        clientesLimiteCredito +
        ventasEnMora +
        inventarioBajo.length +
        metaVentas +
        reglasDisparadas,
    };
  }

  private async upsert(
    negocioId: string,
    tipo: TipoAlerta,
    referenciaId: string,
    severidad: SeveridadAlerta,
    mensaje: string,
    productoId?: string,
    reglaId?: string,
  ): Promise<void> {
    const existente = await this.alertasRepository.findOne({
      where: { negocioId, tipo, referenciaId, resuelta: false },
    });
    if (existente) {
      existente.severidad = severidad;
      existente.mensaje = mensaje;
      const actualizada = await this.alertasRepository.save(existente);
      this.realtimeGateway.emitToNegocio(
        negocioId,
        'alertas:cambio',
        actualizada,
      );
      return;
    }
    const creada = await this.alertasRepository.save(
      this.alertasRepository.create({
        negocioId,
        tipo,
        referenciaId,
        productoId,
        reglaId,
        severidad,
        mensaje,
      }),
    );
    this.realtimeGateway.emitToNegocio(negocioId, 'alertas:cambio', creada);
  }
}
