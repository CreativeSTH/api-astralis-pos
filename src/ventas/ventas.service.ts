import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { Venta } from './entities/venta.entity';
import { VentaItem } from './entities/venta-item.entity';
import { VentaPago } from './entities/venta-pago.entity';
import { Cuota } from './entities/cuota.entity';
import { RegistroPagoCuota } from './entities/registro-pago-cuota.entity';
import { Producto } from '../productos/entities/producto.entity';
import { Bodega } from '../bodegas/entities/bodega.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
import { MovimientoInventario } from '../inventario/entities/movimiento-inventario.entity';
import { MovimientoCaja } from '../caja/entities/movimiento-caja.entity';
import { TurnoCaja } from '../caja/entities/turno-caja.entity';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum';
import { EstadoTurnoCaja, TipoMovimientoCaja } from '../common/enums/caja.enum';
import { TipoVenta, EstadoVenta } from '../common/enums/venta.enum';
import { CajaService } from '../caja/caja.service';
import { ClientesService } from '../clientes/clientes.service';
import { AuthService } from '../auth/auth.service';
import { PermisosService } from '../roles/permisos.service';
import { AlertasService } from '../alertas/alertas.service';
import { MetodosPagoService } from '../metodos-pago/metodos-pago.service';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { CreateVentaDto, DomicilioVentaDto } from './dto/create-venta.dto';
import { CancelarVentaDto } from './dto/cancelar-venta.dto';
import { AbonarCuotaDto } from './dto/abonar-cuota.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Domicilio } from '../domicilios/entities/domicilio.entity';
import { DireccionCliente } from '../clientes/entities/direccion-cliente.entity';
import { EstadoDomicilio } from '../common/enums/estado-domicilio.enum';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { TipoComprobante } from '../common/enums/tipo-comprobante.enum';
import { NumeracionComprobanteService } from '../facturacion/numeracion-comprobante.service';
import { PromocionesPricingService } from '../cupones/promociones-pricing.service';
import { CuponValidacionService } from '../cupones/cupon-validacion.service';
import { Promocion } from '../cupones/entities/promocion.entity';

const TOLERANCIA_REDONDEO = 1;
const DIAS_MORA_PARA_EN_MORA = 60;

interface VentaConDomicilio {
  venta: Venta;
  domicilio: Domicilio | null;
}

@Injectable()
export class VentasService {
  constructor(
    @InjectRepository(Venta)
    private readonly ventasRepository: Repository<Venta>,
    @InjectRepository(Inventario)
    private readonly inventarioRepository: Repository<Inventario>,
    private readonly dataSource: DataSource,
    private readonly cajaService: CajaService,
    private readonly clientesService: ClientesService,
    private readonly authService: AuthService,
    private readonly permisos: PermisosService,
    private readonly alertasService: AlertasService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly metodosPagoService: MetodosPagoService,
    private readonly numeracionComprobanteService: NumeracionComprobanteService,
    private readonly promocionesPricingService: PromocionesPricingService,
    private readonly cuponValidacionService: CuponValidacionService,
    private readonly cls: ClsService,
  ) {}

  private getNegocioId(): string {
    return this.cls.get<string>('negocioId');
  }

  private getUsuarioId(): string {
    return this.cls.get<string>('usuarioId');
  }

  /** Reemplaza la garantía que antes daba `@IsEnum(MetodoPago)` — confirma que cada nombre recibido sea un método activo del negocio. */
  private async validarMetodosPago(nombres: string[]): Promise<void> {
    if (nombres.length === 0) return;
    const activos = new Set(
      (await this.metodosPagoService.findAll()).map((m) => m.nombre),
    );
    const invalido = nombres.find((n) => !activos.has(n));
    if (invalido) {
      throw new BadRequestException(
        `"${invalido}" no es un método de pago activo de este negocio`,
      );
    }
  }

  findAll() {
    return this.ventasRepository.find({
      where: { negocioId: this.getNegocioId() },
      relations: { items: true, pagos: true, cuotas: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Venta> {
    const venta = await this.ventasRepository.findOne({
      where: { id, negocioId: this.getNegocioId() },
      relations: { items: true, pagos: true, cuotas: { historialPagos: true } },
    });
    if (!venta) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }
    return venta;
  }

  findPorCliente(clienteId: string) {
    return this.ventasRepository.find({
      where: { negocioId: this.getNegocioId(), clienteId },
      relations: { cuotas: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** Punto de entrada único: crea venta CONTADO o CREDITO según `dto.tipoVenta`. */
  async crear(dto: CreateVentaDto): Promise<Venta> {
    await this.validarMetodosPago((dto.pagos ?? []).map((p) => p.metodoPago));
    await this.autorizarDescuentoSiAplica(dto);
    const { venta, domicilio } =
      dto.tipoVenta === TipoVenta.CREDITO
        ? await this.crearVentaCredito(dto)
        : await this.crearVentaContado(dto);
    await this.verificarStockPostVenta(venta);
    if (domicilio) {
      this.realtimeGateway.emitToNegocio(
        venta.negocioId,
        'domicilios:cambio',
        domicilio,
      );
    }
    return venta;
  }

  /**
   * Después de confirmada la venta (fuera de la transacción, para no atar la
   * venta ya cobrada a que la generación de alertas salga bien), revisa el
   * inventario de cada producto vendido — si quedó en 0 o por debajo del
   * mínimo, la alerta aparece de inmediato en vez de esperar al cron.
   */
  private async verificarStockPostVenta(venta: Venta): Promise<void> {
    for (const item of venta.items) {
      try {
        const inventario = await this.inventarioRepository.findOne({
          where: {
            negocioId: venta.negocioId,
            productoId: item.productoId,
            bodegaId: venta.bodegaId,
          },
        });
        if (inventario) {
          await this.alertasService.verificarStockItem(
            inventario,
            item.nombreProducto,
          );
        }
      } catch {
        // no crítico — se recupera de todos modos en la próxima corrida del cron
      }
    }
  }

  /**
   * Crea una venta de contado: valida turno de caja abierto, descuenta stock
   * y registra los pagos, todo en una sola transacción.
   */
  private async crearVentaContado(
    dto: CreateVentaDto,
  ): Promise<VentaConDomicilio> {
    if (!dto.pagos || dto.pagos.length === 0) {
      throw new BadRequestException(
        'Una venta de contado requiere al menos un pago',
      );
    }
    const negocioId = this.getNegocioId();
    const usuarioId = this.getUsuarioId();
    // Se valida antes de abrir la transacción para fallar rápido si no hay caja abierta.
    const turno = await this.cajaService.obtenerTurnoAbierto(dto.sucursalId);

    return this.dataSource.transaction(async (manager) => {
      const {
        itemsEntities,
        subtotal,
        descuentoTotal: descuentoItems,
        impuestoTotal,
        costoTotal,
        promocionesAplicadas,
      } = await this.procesarItemsYStock(manager, dto, negocioId);
      const cupon = await this.resolverCupon(manager, negocioId, dto, itemsEntities);
      const { descuentoTotal, total } = this.aplicarDescuentoVenta(
        dto,
        { subtotal, descuentoTotal: descuentoItems, impuestoTotal },
        cupon?.descuento ?? 0,
      );

      const totalPagos = dto.pagos!.reduce((acc, p) => acc + p.monto, 0);
      if (Math.abs(totalPagos - total) > TOLERANCIA_REDONDEO) {
        throw new BadRequestException(
          `La suma de los pagos (${totalPagos}) no coincide con el total de la venta (${total})`,
        );
      }

      const comprobante = await this.resolverComprobante(
        manager,
        negocioId,
        dto.sucursalId,
        dto.tipoComprobante,
      );

      const ventaRepo = manager.getRepository(Venta);
      let venta = ventaRepo.create({
        negocioId,
        sucursalId: dto.sucursalId,
        bodegaId: dto.bodegaId,
        turnoId: turno.id,
        clienteId: dto.clienteId,
        nombreCliente: dto.nombreCliente ?? 'Consumidor final',
        tipoVenta: TipoVenta.CONTADO,
        estado: EstadoVenta.COMPLETADA,
        subtotal,
        descuentoTotal,
        impuestoTotal,
        total,
        costoTotal,
        margenBruto: total - costoTotal,
        numeroCuotas: 0,
        creadaPor: usuarioId,
        ...comprobante,
        cuponId: cupon?.promocion.id,
        descuentoCupon: cupon?.descuento ?? 0,
        items: itemsEntities,
        pagos: dto.pagos!.map((p) =>
          manager.getRepository(VentaPago).create({
            metodoPago: p.metodoPago,
            monto: p.monto,
            referencia: p.referencia,
          }),
        ),
      });
      venta = await ventaRepo.save(venta);

      await this.registrarUsosDePromociones(
        manager,
        negocioId,
        dto.sucursalId,
        venta.id,
        promocionesAplicadas,
        cupon,
      );

      await this.registrarMovimientosInventario(
        manager,
        venta,
        dto.bodegaId,
        negocioId,
        usuarioId,
      );

      const movCajaRepo = manager.getRepository(MovimientoCaja);
      for (const pago of venta.pagos) {
        await movCajaRepo.save(
          movCajaRepo.create({
            negocioId,
            turnoId: turno.id,
            tipo: TipoMovimientoCaja.VENTA,
            monto: pago.monto,
            metodoPago: pago.metodoPago,
            ventaId: venta.id,
            concepto: `Venta ${venta.id}`,
            creadoPor: usuarioId,
          }),
        );
      }

      const domicilio = await this.crearDomicilioSiAplica(
        manager,
        venta,
        dto.domicilio,
        negocioId,
        usuarioId,
      );

      return { venta, domicilio };
    });
  }

  /**
   * Crea una venta a crédito: valida cupo del cliente, genera las cuotas y
   * descuenta stock. No mueve caja — el dinero entra cuando se abonan cuotas.
   */
  private async crearVentaCredito(
    dto: CreateVentaDto,
  ): Promise<VentaConDomicilio> {
    if (!dto.clienteId) {
      throw new BadRequestException('Una venta a crédito requiere un cliente');
    }
    if (!dto.numeroCuotas || !dto.fechaPrimerPago) {
      throw new BadRequestException(
        'Una venta a crédito requiere numeroCuotas y fechaPrimerPago',
      );
    }
    const negocioId = this.getNegocioId();
    const usuarioId = this.getUsuarioId();
    const turno = await this.cajaService.obtenerTurnoAbierto(dto.sucursalId);
    const cliente = await this.clientesService.findOne(dto.clienteId);

    return this.dataSource.transaction(async (manager) => {
      const {
        itemsEntities,
        subtotal,
        descuentoTotal: descuentoItems,
        impuestoTotal,
        costoTotal,
        promocionesAplicadas,
      } = await this.procesarItemsYStock(manager, dto, negocioId);
      const cupon = await this.resolverCupon(manager, negocioId, dto, itemsEntities);
      const { descuentoTotal, total } = this.aplicarDescuentoVenta(
        dto,
        { subtotal, descuentoTotal: descuentoItems, impuestoTotal },
        cupon?.descuento ?? 0,
      );

      if (!dto.omitirValidacionCredito) {
        const verificacion = await this.clientesService.verificarCredito(
          dto.clienteId!,
          total,
        );
        if (!verificacion.aprobado) {
          throw new BadRequestException(
            verificacion.mensaje ?? 'Crédito no aprobado para este cliente',
          );
        }
      }

      const tasaInteresMora = dto.tasaInteresMora ?? 0.1;
      const numeroCuotas = dto.numeroCuotas!;
      const montoBase = Math.floor((total / numeroCuotas) * 100) / 100;
      const cuotasEntities: Cuota[] = [];
      const cuotaRepo = manager.getRepository(Cuota);

      for (let i = 0; i < numeroCuotas; i++) {
        const esUltima = i === numeroCuotas - 1;
        const monto = esUltima
          ? total - montoBase * (numeroCuotas - 1)
          : montoBase;
        const fechaVencimiento = this.sumarMeses(dto.fechaPrimerPago!, i);
        cuotasEntities.push(
          cuotaRepo.create({
            numero: i + 1,
            monto,
            fechaVencimiento,
            montoPagado: 0,
            saldoPendiente: monto,
            pagada: false,
            diasMora: 0,
            interesMora: tasaInteresMora,
            montoMora: 0,
            montoTotalConMora: monto,
          }),
        );
      }

      const comprobante = await this.resolverComprobante(
        manager,
        negocioId,
        dto.sucursalId,
        dto.tipoComprobante,
      );

      const ventaRepo = manager.getRepository(Venta);
      let venta = ventaRepo.create({
        negocioId,
        sucursalId: dto.sucursalId,
        bodegaId: dto.bodegaId,
        turnoId: turno.id,
        clienteId: dto.clienteId,
        nombreCliente: dto.nombreCliente ?? cliente.nombre,
        tipoVenta: TipoVenta.CREDITO,
        estado: EstadoVenta.ACTIVA,
        subtotal,
        descuentoTotal,
        impuestoTotal,
        total,
        costoTotal,
        margenBruto: total - costoTotal,
        numeroCuotas,
        tasaInteresMora,
        creadaPor: usuarioId,
        ...comprobante,
        cuponId: cupon?.promocion.id,
        descuentoCupon: cupon?.descuento ?? 0,
        items: itemsEntities,
        cuotas: cuotasEntities,
      });
      venta = await ventaRepo.save(venta);

      await this.registrarUsosDePromociones(
        manager,
        negocioId,
        dto.sucursalId,
        venta.id,
        promocionesAplicadas,
        cupon,
      );

      await this.registrarMovimientosInventario(
        manager,
        venta,
        dto.bodegaId,
        negocioId,
        usuarioId,
      );
      await this.clientesService.ajustarDeuda(dto.clienteId!, total);

      const domicilio = await this.crearDomicilioSiAplica(
        manager,
        venta,
        dto.domicilio,
        negocioId,
        usuarioId,
      );

      return { venta, domicilio };
    });
  }

  /**
   * Asigna tipo + número de comprobante dentro de la misma transacción de la
   * venta — nunca bloquea la venta por falta de configuración: si la
   * sucursal no tiene plantilla/rango configurado, igual numera
   * secuencialmente desde 1 (ver `NumeracionComprobanteService`).
   */
  private async resolverComprobante(
    manager: EntityManager,
    negocioId: string,
    sucursalId: string,
    tipoSolicitado?: TipoComprobante,
  ): Promise<{
    numeroComprobante: string;
    tipoComprobanteEmitido: TipoComprobante;
    plantillaComprobanteId?: string;
  }> {
    const sucursal = await manager
      .getRepository(Sucursal)
      .findOneOrFail({ where: { id: sucursalId } });
    const tipo = tipoSolicitado ?? sucursal.tipoComprobanteDefecto;
    const plantillaComprobanteId =
      tipo === TipoComprobante.FACTURA
        ? sucursal.plantillaFacturaDefectoId
        : sucursal.plantillaReciboDefectoId;

    const { numeroFormateado } = await this.numeracionComprobanteService.siguienteNumero(
      manager,
      negocioId,
      sucursalId,
      tipo,
    );

    return { numeroComprobante: numeroFormateado, tipoComprobanteEmitido: tipo, plantillaComprobanteId };
  }

  /**
   * Crea el domicilio (y, si hace falta, la dirección nueva del cliente)
   * dentro de la misma transacción que la venta — un domicilio nunca queda
   * huérfano de una venta que no se completó. Reutiliza `manager` en vez de
   * los repositorios inyectados, mismo patrón que ya usa este método para
   * `MovimientoCaja`/`Cuota`.
   */
  private async crearDomicilioSiAplica(
    manager: EntityManager,
    venta: Venta,
    dto: DomicilioVentaDto | undefined,
    negocioId: string,
    usuarioId: string,
  ): Promise<Domicilio | null> {
    if (!dto) return null;
    if (!venta.clienteId) {
      throw new BadRequestException(
        'Un domicilio requiere un cliente asociado a la venta — las direcciones dependen de él',
      );
    }

    const direccionRepo = manager.getRepository(DireccionCliente);
    let direccion: DireccionCliente | null = null;

    if (dto.direccionClienteId) {
      direccion = await direccionRepo.findOne({
        where: {
          id: dto.direccionClienteId,
          clienteId: venta.clienteId,
          negocioId,
        },
      });
      if (!direccion) {
        throw new BadRequestException(
          'La dirección indicada no existe o no pertenece a este cliente',
        );
      }
    } else if (dto.direccionNueva) {
      // Misma regla que ClientesService.agregarDireccion() — se duplica acá porque esta
      // creación tiene que vivir dentro de la transacción de la venta (ver manager arriba).
      const esLaPrimera =
        (await direccionRepo.count({
          where: { clienteId: venta.clienteId, activo: true },
        })) === 0;
      if (dto.direccionNueva.predeterminada || esLaPrimera) {
        await direccionRepo.update(
          { clienteId: venta.clienteId, negocioId },
          { predeterminada: false },
        );
      }
      direccion = await direccionRepo.save(
        direccionRepo.create({
          negocioId,
          clienteId: venta.clienteId,
          ...dto.direccionNueva,
          predeterminada: dto.direccionNueva.predeterminada || esLaPrimera,
        }),
      );
    } else {
      throw new BadRequestException(
        'Debe indicarse direccionClienteId o direccionNueva para el domicilio',
      );
    }

    const domicilioRepo = manager.getRepository(Domicilio);
    return domicilioRepo.save(
      domicilioRepo.create({
        negocioId,
        sucursalId: venta.sucursalId,
        ventaId: venta.id,
        clienteId: venta.clienteId,
        nombreCliente: venta.nombreCliente,
        direccionClienteId: direccion.id,
        direccionTexto: this.formatearDireccion(direccion),
        puntoReferencia: direccion.puntoReferencia,
        telefonoContacto: direccion.telefonoContacto,
        costoDomicilio: dto.costoDomicilio,
        estado: EstadoDomicilio.NUEVO,
        creadoPor: usuarioId,
      }),
    );
  }

  private formatearDireccion(direccion: DireccionCliente): string {
    return [
      direccion.direccionLinea1,
      direccion.direccionLinea2,
      direccion.barrio,
    ]
      .filter(Boolean)
      .join(', ');
  }

  /**
   * Suma el descuento manual de la venta completa (dto.descuentoVenta) a los
   * descuentos por línea ya calculados. Se aplica después de impuestos —no
   * recalcula el IVA por línea— igual que el botón de "descuento" de un POS
   * físico: una rebaja final sobre el total, no una repricing de cada ítem.
   */
  /**
   * Un descuento manual (dto.descuentoVenta) requiere el PIN de alguien con VENTAS:ELIMINAR si
   * quien está cobrando no lo tiene — mismo mecanismo de step-up que `cancelar()`, reutilizando
   * el mismo permiso como "puede saltarse controles sensibles de una venta sin pedir aprobación"
   * en vez de sumar un AccionPermiso nuevo solo para esto.
   */
  private async autorizarDescuentoSiAplica(dto: CreateVentaDto): Promise<void> {
    if (!dto.descuentoVenta || dto.descuentoVenta <= 0) return;
    const negocioId = this.getNegocioId();
    const rolId = this.cls.get<string>('rolId');
    const puedeSinPin = await this.permisos.rolTienePermiso(
      rolId,
      ModuloPermiso.VENTAS,
      AccionPermiso.ELIMINAR,
    );
    if (puedeSinPin) return;
    if (!dto.pinAutorizacionDescuento) {
      throw new ForbiddenException(
        'Se requiere el PIN de un administrador para aplicar un descuento manual',
      );
    }
    await this.authService.autorizarConPin(
      negocioId,
      dto.pinAutorizacionDescuento,
      ModuloPermiso.VENTAS,
      AccionPermiso.ELIMINAR,
    );
  }

  private aplicarDescuentoVenta(
    dto: CreateVentaDto,
    base: { subtotal: number; descuentoTotal: number; impuestoTotal: number },
    descuentoCupon = 0,
  ): { descuentoTotal: number; total: number } {
    const descuentoTotal =
      base.descuentoTotal + (dto.descuentoVenta ?? 0) + descuentoCupon;
    const total = base.subtotal - descuentoTotal + base.impuestoTotal;
    if (total < 0) {
      throw new BadRequestException('El descuento supera el total de la venta');
    }
    return { descuentoTotal, total };
  }

  /** Procesa items de venta: calcula totales por línea (aplicando promociones automáticas vigentes) y descuenta stock. Común a CONTADO/CREDITO. */
  private async procesarItemsYStock(
    manager: EntityManager,
    dto: CreateVentaDto,
    negocioId: string,
  ) {
    const productoRepo = manager.getRepository(Producto);
    const inventarioRepo = manager.getRepository(Inventario);

    // Defensa en profundidad: nunca confiar en que el `bodegaId` que manda el cliente
    // realmente pertenece a la `sucursalId` de la venta — el frontend ya lo garantiza
    // (ver `PuntoVenta.bodega`), pero acá es donde se protege de verdad. Sin esto, un
    // `bodegaId` de otra sucursal del mismo negocio pasaba sin ningún control y la venta
    // terminaba descontando stock de la bodega equivocada.
    const bodega = await manager.getRepository(Bodega).findOne({
      where: {
        id: dto.bodegaId,
        negocioId,
        sucursalId: dto.sucursalId,
        activo: true,
      },
    });
    if (!bodega) {
      throw new BadRequestException(
        'La bodega indicada no pertenece a la sucursal de la venta',
      );
    }

    let subtotal = 0;
    let descuentoTotal = 0;
    let impuestoTotal = 0;
    let costoTotal = 0;
    const itemsEntities: VentaItem[] = [];
    // Suma del descuento otorgado por cada promoción automática, para registrar un solo
    // PromocionUso por promoción al final (no uno por línea).
    const promocionesAplicadas = new Map<string, number>();

    for (const itemDto of dto.items) {
      const producto = await productoRepo.findOne({
        where: { id: itemDto.productoId, negocioId, activo: true },
        relations: { categorias: true },
      });
      if (!producto) {
        throw new NotFoundException(
          `Producto ${itemDto.productoId} no encontrado`,
        );
      }

      // El precio nunca se confía del cliente: se recalcula acá, aplicando la promoción
      // automática vigente para este producto/sucursal/bodega si hay alguna.
      const { precio: precioEfectivo, promocionId } =
        await this.promocionesPricingService.precioEfectivo(
          negocioId,
          dto.sucursalId,
          dto.bodegaId,
          producto,
          manager,
        );

      const descuento = itemDto.descuento ?? 0;
      const bruto = precioEfectivo * itemDto.cantidad;
      const baseImponible = bruto - descuento;
      if (baseImponible < 0) {
        throw new BadRequestException(
          `El descuento supera el valor del producto "${producto.nombre}"`,
        );
      }
      const impuesto =
        baseImponible * (Number(producto.porcentajeImpuesto) / 100);
      const costoItem = Number(producto.costo) * itemDto.cantidad;

      subtotal += bruto;
      descuentoTotal += descuento;
      impuestoTotal += impuesto;
      costoTotal += costoItem;

      if (promocionId) {
        const montoPromocion =
          (Number(producto.precioVenta) - precioEfectivo) * itemDto.cantidad;
        promocionesAplicadas.set(
          promocionId,
          (promocionesAplicadas.get(promocionId) ?? 0) + montoPromocion,
        );
      }

      itemsEntities.push(
        manager.getRepository(VentaItem).create({
          productoId: producto.id,
          nombreProducto: producto.nombre,
          cantidad: itemDto.cantidad,
          precioUnitario: precioEfectivo,
          descuento,
          subtotal: baseImponible + impuesto,
          costoUnitario: producto.costo,
          promocionId,
        }),
      );

      // Lock pesimista: sin esto, dos ventas concurrentes del mismo producto pueden leer el mismo
      // stock antes de que ninguna confirme y las dos "ganan" (sobreventa) — la transacción sola no
      // lo evita bajo el nivel de aislamiento por defecto de Postgres.
      const inventario = await inventarioRepo.findOne({
        where: { negocioId, productoId: producto.id, bodegaId: dto.bodegaId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inventario) {
        throw new BadRequestException(
          `No hay inventario registrado para "${producto.nombre}" en la bodega indicada`,
        );
      }
      const nuevaCantidad = Number(inventario.cantidad) - itemDto.cantidad;
      if (nuevaCantidad < 0) {
        throw new BadRequestException(
          `Stock insuficiente para "${producto.nombre}"`,
        );
      }
      inventario.cantidad = nuevaCantidad;
      await inventarioRepo.save(inventario);
    }

    return {
      itemsEntities,
      subtotal,
      descuentoTotal,
      impuestoTotal,
      costoTotal,
      promocionesAplicadas,
    };
  }

  /** Valida (con lock) el cupón de la venta si se envió uno — nunca confía en el descuento calculado por el cliente. */
  private async resolverCupon(
    manager: EntityManager,
    negocioId: string,
    dto: CreateVentaDto,
    itemsEntities: VentaItem[],
  ): Promise<{ promocion: Promocion; descuento: number } | undefined> {
    if (!dto.cuponCodigo) return undefined;
    return this.cuponValidacionService.bloquearYValidar(
      manager,
      negocioId,
      dto.cuponCodigo,
      {
        sucursalId: dto.sucursalId,
        bodegaId: dto.bodegaId,
        items: itemsEntities.map((item) => ({
          productoId: item.productoId,
          cantidad: Number(item.cantidad),
          precioUnitario: Number(item.precioUnitario),
        })),
      },
    );
  }

  /** Registra en `promociones_uso` cada promoción automática que afectó la venta, más el cupón si se redimió uno. Se llama después de guardar la venta (necesita venta.id). */
  private async registrarUsosDePromociones(
    manager: EntityManager,
    negocioId: string,
    sucursalId: string,
    ventaId: string,
    promocionesAplicadas: Map<string, number>,
    cupon?: { promocion: Promocion; descuento: number },
  ): Promise<void> {
    for (const [promocionId, monto] of promocionesAplicadas) {
      await this.cuponValidacionService.registrarUso(
        manager,
        promocionId,
        ventaId,
        negocioId,
        sucursalId,
        monto,
      );
    }
    if (cupon) {
      await this.cuponValidacionService.registrarUso(
        manager,
        cupon.promocion.id,
        ventaId,
        negocioId,
        sucursalId,
        cupon.descuento,
      );
    }
  }

  private async registrarMovimientosInventario(
    manager: EntityManager,
    venta: Venta,
    bodegaId: string,
    negocioId: string,
    usuarioId: string,
  ): Promise<void> {
    const movInventarioRepo = manager.getRepository(MovimientoInventario);
    for (const item of venta.items) {
      await movInventarioRepo.save(
        movInventarioRepo.create({
          negocioId,
          productoId: item.productoId,
          bodegaId,
          tipo: TipoMovimientoInventario.VENTA,
          cantidad: item.cantidad,
          motivo: `Venta ${venta.id}`,
          ventaId: venta.id,
          creadoPor: usuarioId,
        }),
      );
    }
  }

  private sumarMeses(fechaIso: string, meses: number): string {
    const fecha = new Date(fechaIso + 'T00:00:00Z');
    fecha.setUTCMonth(fecha.getUTCMonth() + meses);
    return fecha.toISOString().slice(0, 10);
  }

  /** Abona (total o parcialmente) una cuota de una venta a crédito. */
  async abonarCuota(
    ventaId: string,
    dto: AbonarCuotaDto,
  ): Promise<{ venta: Venta; cuotaAfectada: Cuota; mensaje: string }> {
    const negocioId = this.getNegocioId();
    const usuarioId = this.getUsuarioId();
    await this.validarMetodosPago([dto.metodoPago]);

    return this.dataSource.transaction(async (manager) => {
      const ventaRepo = manager.getRepository(Venta);
      const cuotaRepo = manager.getRepository(Cuota);

      const venta = await ventaRepo.findOne({
        where: { id: ventaId, negocioId },
        relations: { cuotas: true },
      });
      if (!venta) {
        throw new NotFoundException(`Venta con ID ${ventaId} no encontrada`);
      }
      if (venta.tipoVenta !== TipoVenta.CREDITO) {
        throw new BadRequestException(
          'Solo las ventas a crédito reciben abonos de cuota',
        );
      }

      const cuota = venta.cuotas.find((c) => c.numero === dto.numeroCuota);
      if (!cuota) {
        throw new NotFoundException(
          `Cuota ${dto.numeroCuota} no encontrada en esta venta`,
        );
      }
      if (cuota.pagada) {
        throw new BadRequestException(
          'Esta cuota ya está completamente pagada',
        );
      }

      this.recalcularMoraDeCuota(cuota, Number(venta.tasaInteresMora));

      const incluirMora = dto.incluirMora ?? true;
      let restante = dto.montoAbono;
      let montoMoraPagada = 0;

      if (incluirMora && cuota.montoMora > 0) {
        montoMoraPagada = Math.min(restante, Number(cuota.montoMora));
        cuota.montoMora = Number(cuota.montoMora) - montoMoraPagada;
        restante -= montoMoraPagada;
      }

      const montoPrincipalPagado = Math.min(
        restante,
        Number(cuota.saldoPendiente),
      );
      cuota.montoPagado = Number(cuota.montoPagado) + montoPrincipalPagado;
      cuota.saldoPendiente =
        Number(cuota.saldoPendiente) - montoPrincipalPagado;
      cuota.montoTotalConMora =
        Number(cuota.saldoPendiente) + Number(cuota.montoMora);

      if (cuota.saldoPendiente <= TOLERANCIA_REDONDEO) {
        cuota.pagada = true;
        cuota.saldoPendiente = 0;
        cuota.fechaPago = new Date();
      }
      await cuotaRepo.save(cuota);

      await manager.getRepository(RegistroPagoCuota).save(
        manager.getRepository(RegistroPagoCuota).create({
          cuotaId: cuota.id,
          monto: dto.montoAbono,
          metodoPago: dto.metodoPago,
          referenciaPago: dto.referenciaPago,
          registradoPor: usuarioId,
          notas: dto.notas,
        }),
      );

      // El abono a cuota entra a caja como si fuera una venta en efectivo/digital del turno actual.
      const turno = await this.cajaService
        .obtenerTurnoAbierto(venta.sucursalId)
        .catch(() => null);
      if (turno) {
        await manager.getRepository(MovimientoCaja).save(
          manager.getRepository(MovimientoCaja).create({
            negocioId,
            turnoId: turno.id,
            tipo: TipoMovimientoCaja.VENTA,
            monto: dto.montoAbono,
            metodoPago: dto.metodoPago,
            ventaId: venta.id,
            concepto: `Abono cuota ${cuota.numero} — venta ${venta.id}`,
            creadoPor: usuarioId,
          }),
        );
      }

      await this.clientesService.ajustarDeuda(
        venta.clienteId!,
        -montoPrincipalPagado,
      );

      const cuotasActualizadas = await cuotaRepo.find({
        where: { ventaId: venta.id },
      });
      const todasPagadas = cuotasActualizadas.every((c) => c.pagada);
      const algunaPagada = cuotasActualizadas.some((c) => c.montoPagado > 0);
      venta.estado = todasPagadas
        ? EstadoVenta.COMPLETADA
        : algunaPagada
          ? EstadoVenta.PARCIALMENTE_PAGADA
          : venta.estado;
      await ventaRepo.save(venta);

      return {
        venta,
        cuotaAfectada: cuota,
        mensaje: 'Abono registrado exitosamente',
      };
    });
  }

  private recalcularMoraDeCuota(cuota: Cuota, tasaInteresMora: number): void {
    if (cuota.pagada) return;
    const hoy = new Date();
    const vencimiento = new Date(cuota.fechaVencimiento + 'T00:00:00Z');
    const diasMora = Math.max(
      0,
      Math.floor(
        (hoy.getTime() - vencimiento.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    cuota.diasMora = diasMora;
    cuota.montoMora =
      diasMora > 0
        ? Number(
            (
              Number(cuota.saldoPendiente) *
              (tasaInteresMora / 100) *
              diasMora
            ).toFixed(2),
          )
        : 0;
    cuota.montoTotalConMora =
      Number(cuota.saldoPendiente) + Number(cuota.montoMora);
  }

  /** Recalcula la mora de todas las cuotas vencidas y sin pagar del negocio. */
  async calcularMoras(): Promise<{ cuotasActualizadas: number }> {
    const negocioId = this.getNegocioId();
    const ventas = await this.ventasRepository.find({
      where: { negocioId, tipoVenta: TipoVenta.CREDITO },
      relations: { cuotas: true },
    });

    let actualizadas = 0;
    for (const venta of ventas) {
      for (const cuota of venta.cuotas) {
        if (cuota.pagada) continue;
        this.recalcularMoraDeCuota(cuota, Number(venta.tasaInteresMora));
        if (cuota.diasMora > 0) {
          await this.dataSource.getRepository(Cuota).save(cuota);
          actualizadas++;
        }
      }
    }
    return { cuotasActualizadas: actualizadas };
  }

  /** Actualiza el estado (VENCIDA/EN_MORA) de las ventas a crédito según sus cuotas. */
  async verificarVencimientos(): Promise<{
    ventasActualizadas: number;
    nuevasVencidas: number;
    nuevasEnMora: number;
  }> {
    const negocioId = this.getNegocioId();
    const ventas = await this.ventasRepository.find({
      where: { negocioId, tipoVenta: TipoVenta.CREDITO },
      relations: { cuotas: true },
    });

    let nuevasVencidas = 0;
    let nuevasEnMora = 0;
    let ventasActualizadas = 0;

    for (const venta of ventas) {
      if (
        venta.estado === EstadoVenta.COMPLETADA ||
        venta.estado === EstadoVenta.CANCELADA
      )
        continue;

      const pendientes = venta.cuotas.filter((c) => !c.pagada);
      const hoy = new Date();
      const vencidas = pendientes.filter(
        (c) => new Date(c.fechaVencimiento + 'T00:00:00Z') < hoy,
      );
      const maxDiasMora = Math.max(0, ...pendientes.map((c) => c.diasMora));

      let nuevoEstado = venta.estado;
      if (maxDiasMora > DIAS_MORA_PARA_EN_MORA) {
        nuevoEstado = EstadoVenta.EN_MORA;
      } else if (vencidas.length > 0) {
        nuevoEstado = EstadoVenta.VENCIDA;
      }

      if (nuevoEstado !== venta.estado) {
        if (nuevoEstado === EstadoVenta.VENCIDA) nuevasVencidas++;
        if (nuevoEstado === EstadoVenta.EN_MORA) {
          nuevasEnMora++;
          if (venta.clienteId) {
            await this.clientesService
              .bloquear(
                venta.clienteId,
                `Mora en venta ${venta.id} — más de ${DIAS_MORA_PARA_EN_MORA} días de atraso`,
              )
              .catch(() => undefined);
          }
        }
        venta.estado = nuevoEstado;
        await this.ventasRepository.save(venta);
        ventasActualizadas++;
      }
    }

    return { ventasActualizadas, nuevasVencidas, nuevasEnMora };
  }

  async cancelar(id: string, dto: CancelarVentaDto): Promise<Venta> {
    const negocioId = this.getNegocioId();
    const usuarioId = this.getUsuarioId();
    const rolId = this.cls.get<string>('rolId');

    // Quien tiene VENTAS:ELIMINAR puede cancelar directamente. Cualquier otro
    // rol (típicamente el cajero del turno) necesita el PIN de alguien con
    // ese permiso como aprobación puntual — sin cambiar la sesión activa, a
    // diferencia del "cambio de cajero" del sidebar (ver AuthService.verificarPin).
    let autorizadoPor = usuarioId;
    const puedeCancelar = await this.permisos.rolTienePermiso(
      rolId,
      ModuloPermiso.VENTAS,
      AccionPermiso.ELIMINAR,
    );
    if (!puedeCancelar) {
      if (!dto.pinAutorizacion) {
        throw new ForbiddenException(
          'Se requiere el PIN de un usuario autorizado para cancelar esta venta',
        );
      }
      const autorizador = await this.authService.autorizarConPin(
        negocioId,
        dto.pinAutorizacion,
        ModuloPermiso.VENTAS,
        AccionPermiso.ELIMINAR,
      );
      autorizadoPor = autorizador.id;
    }

    const venta = await this.dataSource.transaction(async (manager) => {
      const ventaRepo = manager.getRepository(Venta);
      const inventarioRepo = manager.getRepository(Inventario);
      const movInventarioRepo = manager.getRepository(MovimientoInventario);
      const movCajaRepo = manager.getRepository(MovimientoCaja);
      const turnoRepo = manager.getRepository(TurnoCaja);

      const ventaActual = await ventaRepo.findOne({
        where: { id, negocioId },
        relations: { items: true, cuotas: true },
      });
      if (!ventaActual) {
        throw new NotFoundException(`Venta con ID ${id} no encontrada`);
      }
      if (ventaActual.estado === EstadoVenta.CANCELADA) {
        throw new BadRequestException('Esta venta ya está cancelada');
      }

      // Una venta CONTADO movió caja al crearse — cancelarla debe revertir
      // ese dinero, si no el arqueo del turno queda con dinero fantasma.
      // Solo se permite mientras el turno siga abierto: uno ya cerrado tiene
      // su arqueo congelado (montoContadoCierre/diferencia) y tocar el
      // movimiento retroactivamente lo dejaría inconsistente.
      if (ventaActual.tipoVenta === TipoVenta.CONTADO) {
        const turno = await turnoRepo.findOne({
          where: { id: ventaActual.turnoId },
        });
        if (turno && turno.estado === EstadoTurnoCaja.CERRADO) {
          throw new BadRequestException(
            'No se puede cancelar una venta de un turno de caja ya cerrado',
          );
        }
        await movCajaRepo.delete({ ventaId: ventaActual.id });
      }

      if (dto.devolverStock !== false) {
        for (const item of ventaActual.items) {
          const inventario = await inventarioRepo.findOne({
            where: {
              negocioId,
              productoId: item.productoId,
              bodegaId: ventaActual.bodegaId,
            },
            lock: { mode: 'pessimistic_write' },
          });
          if (inventario) {
            inventario.cantidad =
              Number(inventario.cantidad) + Number(item.cantidad);
            await inventarioRepo.save(inventario);
            await movInventarioRepo.save(
              movInventarioRepo.create({
                negocioId,
                productoId: item.productoId,
                bodegaId: ventaActual.bodegaId,
                tipo: TipoMovimientoInventario.DEVOLUCION,
                cantidad: item.cantidad,
                motivo: `Cancelación venta ${ventaActual.id}`,
                ventaId: ventaActual.id,
                creadoPor: usuarioId,
              }),
            );
          }
        }
      }

      ventaActual.estado = EstadoVenta.CANCELADA;
      ventaActual.canceladaPor = autorizadoPor;
      ventaActual.motivoCancelacion = dto.motivo;
      ventaActual.fechaCancelacion = new Date();
      return ventaRepo.save(ventaActual);
    });

    if (venta.tipoVenta === TipoVenta.CREDITO && venta.clienteId) {
      const saldoPendiente = venta.cuotas
        .filter((c) => !c.pagada)
        .reduce((sum, c) => sum + Number(c.saldoPendiente), 0);
      if (saldoPendiente > 0) {
        await this.clientesService.ajustarDeuda(
          venta.clienteId,
          -saldoPendiente,
        );
      }
    }

    return venta;
  }
}
