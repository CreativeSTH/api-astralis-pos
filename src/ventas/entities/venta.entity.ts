import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { TurnoCaja } from '../../caja/entities/turno-caja.entity';
import { TipoVenta, EstadoVenta } from '../../common/enums/venta.enum';
import { TipoComprobanteVenta } from '../../common/enums/tipo-comprobante.enum';
import { VentaItem } from './venta-item.entity';
import { VentaPago } from './venta-pago.entity';
import { Cuota } from './cuota.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';

@Entity('ventas')
// Fase 6b: una venta sin conexión nunca se registra dos veces.
@Index('UQ_ventas_negocio_id_local', ['negocioId', 'idLocal'], { unique: true, where: '"id_local" IS NOT NULL' })
export class Venta extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'sucursal_id' })
  sucursalId: string;

  @ManyToOne(() => Sucursal)
  @JoinColumn({ name: 'sucursal_id' })
  sucursal: Sucursal;

  @Column({ name: 'bodega_id' })
  bodegaId: string;

  @Column({ name: 'turno_id' })
  turnoId: string;

  /** Fase 6b: UUID generado en la caja para la venta hecha sin conexión (idempotencia al sincronizar). */
  @Column({ name: 'id_local', type: 'varchar', nullable: true })
  idLocal: string | null;

  @Column({ name: 'vendida_sin_conexion', default: false })
  vendidaSinConexion: boolean;

  /** Número impreso en la caja sin conexión (recibo provisional `SC…` o factura de papel `CONT…`). */
  @Column({ name: 'numero_sin_conexion', type: 'varchar', nullable: true })
  numeroSinConexion: string | null;

  @ManyToOne(() => TurnoCaja)
  @JoinColumn({ name: 'turno_id' })
  turno: TurnoCaja;

  @Column({ name: 'cliente_id', nullable: true })
  clienteId?: string;

  @ManyToOne(() => Cliente, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Cliente;

  @Column({ name: 'nombre_cliente', default: 'Consumidor final' })
  nombreCliente: string;

  @Column({
    name: 'tipo_venta',
    type: 'enum',
    enum: TipoVenta,
    default: TipoVenta.CONTADO,
  })
  tipoVenta: TipoVenta;

  @Column({ type: 'enum', enum: EstadoVenta, default: EstadoVenta.ACTIVA })
  estado: EstadoVenta;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  subtotal: number;

  @Column({
    name: 'descuento_total',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  descuentoTotal: number;

  @Column({
    name: 'impuesto_total',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  impuestoTotal: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  total: number;

  @Column({ name: 'costo_total', type: 'numeric', precision: 12, scale: 2 })
  costoTotal: number;

  @Column({ name: 'margen_bruto', type: 'numeric', precision: 12, scale: 2 })
  margenBruto: number;

  @Column({ name: 'numero_cuotas', default: 0 })
  numeroCuotas: number;

  @Column({
    name: 'tasa_interes_mora',
    type: 'numeric',
    precision: 5,
    scale: 3,
    default: 0.1,
  })
  tasaInteresMora: number;

  @Column({ name: 'cancelada_por', nullable: true })
  canceladaPor?: string;

  @Column({ name: 'motivo_cancelacion', nullable: true })
  motivoCancelacion?: string;

  @Column({ name: 'fecha_cancelacion', type: 'timestamptz', nullable: true })
  fechaCancelacion?: Date;

  @Column({ name: 'creada_por' })
  creadaPor: string;

  /** Denormalizados al momento de la venta — una reimpresión siempre muestra lo realmente emitido, aunque los defaults de la sucursal cambien después. */
  @Column({ name: 'numero_comprobante', nullable: true })
  numeroComprobante?: string;

  @Column({
    name: 'tipo_comprobante_emitido',
    type: 'enum',
    enum: TipoComprobanteVenta,
    nullable: true,
  })
  tipoComprobanteEmitido?: TipoComprobanteVenta;

  /** Cupón redimido en esta venta (tipo=CUPON), si el cajero ingresó uno. Denormalizado para reportes/histórico. */
  @Column({ name: 'cupon_id', nullable: true })
  cuponId?: string;

  @Column({
    name: 'descuento_cupon',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  descuentoCupon: number;

  @OneToMany(() => VentaItem, (item) => item.venta, { cascade: true })
  items: VentaItem[];

  @OneToMany(() => VentaPago, (pago) => pago.venta, { cascade: true })
  pagos: VentaPago[];

  @OneToMany(() => Cuota, (cuota) => cuota.venta, { cascade: true })
  cuotas: Cuota[];
}
