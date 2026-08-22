import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Producto } from '../../productos/entities/producto.entity';

/** Lista de "hay que pedirle a un proveedor" — se alimenta manualmente desde
 * las alertas de stock (botón "Añadir a lista de pedidos"), no automático. */
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

  @Column({ default: false })
  comprado: boolean;

  @Column({ name: 'agregado_por', nullable: true })
  agregadoPor?: string;
}
