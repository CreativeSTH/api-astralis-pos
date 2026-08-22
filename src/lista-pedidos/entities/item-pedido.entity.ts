import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { Proveedor } from '../../proveedores/entities/proveedor.entity';
import { EstadoItemPedido } from '../../common/enums/estado-item-pedido.enum';

/**
 * Flujo de compra: PENDIENTE (se agregó desde una alerta de stock) →
 * PEDIDO (se le hizo el pedido a un proveedor con costo/cantidad) →
 * INGRESADO (llegó a la tienda, ya movió stock y costo de Producto).
 */
@Entity('items_pedido')
export class ItemPedido extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'producto_id' })
  productoId: string;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto;

  /** Denormalizado — si el producto se borra o cambia de nombre, la lista sigue siendo legible. */
  @Column({ name: 'nombre_producto' })
  nombreProducto: string;

  @Column({
    type: 'enum',
    enum: EstadoItemPedido,
    default: EstadoItemPedido.PENDIENTE,
  })
  estado: EstadoItemPedido;

  @Column({ name: 'proveedor_id', nullable: true })
  proveedorId?: string;

  @ManyToOne(() => Proveedor, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor?: Proveedor;

  @Column({ name: 'nombre_proveedor', nullable: true })
  nombreProveedor?: string;

  @Column({
    name: 'costo_unitario',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  costoUnitario?: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  cantidad?: number;

  @Column({ name: 'fecha_pedido', nullable: true })
  fechaPedido?: Date;

  @Column({ name: 'fecha_ingreso', nullable: true })
  fechaIngreso?: Date;

  @Column({ name: 'agregado_por', nullable: true })
  agregadoPor?: string;

  @Column({ name: 'pedido_por', nullable: true })
  pedidoPor?: string;

  @Column({ name: 'ingresado_por', nullable: true })
  ingresadoPor?: string;
}
