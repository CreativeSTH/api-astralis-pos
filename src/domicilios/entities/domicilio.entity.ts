import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { Venta } from '../../ventas/entities/venta.entity';
import { Cliente } from '../../clientes/entities/cliente.entity';
import { DireccionCliente } from '../../clientes/entities/direccion-cliente.entity';
import { EstadoDomicilio } from '../../common/enums/estado-domicilio.enum';

/**
 * Un domicilio siempre nace de una venta (se crea en la misma transacción
 * que la venta, ver VentasService) — no existe un domicilio "suelto".
 * Flujo: NUEVO -> EN_CAMINO -> ENTREGADO, con CANCELADO alcanzable desde
 * NUEVO o EN_CAMINO. Cancelar el domicilio no cancela la venta.
 */
@Entity('domicilios')
export class Domicilio extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'sucursal_id' })
  sucursalId: string;

  @ManyToOne(() => Sucursal)
  @JoinColumn({ name: 'sucursal_id' })
  sucursal?: Sucursal;

  @Index({ unique: true })
  @Column({ name: 'venta_id' })
  ventaId: string;

  @ManyToOne(() => Venta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta?: Venta;

  @Column({ name: 'cliente_id', nullable: true })
  clienteId?: string;

  @ManyToOne(() => Cliente, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Cliente;

  /** Denormalizado — igual criterio que Venta.nombreCliente. */
  @Column({ name: 'nombre_cliente' })
  nombreCliente: string;

  @Column({ name: 'direccion_cliente_id', nullable: true })
  direccionClienteId?: string;

  @ManyToOne(() => DireccionCliente, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'direccion_cliente_id' })
  direccionCliente?: DireccionCliente;

  /** Snapshot de la dirección al crear el domicilio — si el cliente edita/borra la dirección después, el histórico no cambia. */
  @Column({ name: 'direccion_texto' })
  direccionTexto: string;

  @Column({ name: 'punto_referencia', nullable: true })
  puntoReferencia?: string;

  @Column({ name: 'telefono_contacto', nullable: true })
  telefonoContacto?: string;

  @Column({
    type: 'enum',
    enum: EstadoDomicilio,
    default: EstadoDomicilio.NUEVO,
  })
  estado: EstadoDomicilio;

  /** Quién lo lleva — texto libre, no hace falta una entidad "Domiciliarios" para esto. */
  @Column({ name: 'domiciliario_nombre', nullable: true })
  domiciliarioNombre?: string;

  /** Informativo — no afecta el total de la venta. */
  @Column({
    name: 'costo_domicilio',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  costoDomicilio?: number;

  @Column({ name: 'motivo_cancelacion', nullable: true })
  motivoCancelacion?: string;

  @Column({ name: 'fecha_en_camino', type: 'timestamptz', nullable: true })
  fechaEnCamino?: Date;

  @Column({ name: 'fecha_entregado', type: 'timestamptz', nullable: true })
  fechaEntregado?: Date;

  @Column({ name: 'fecha_cancelado', type: 'timestamptz', nullable: true })
  fechaCancelado?: Date;

  @Column({ name: 'creado_por' })
  creadoPor: string;
}
