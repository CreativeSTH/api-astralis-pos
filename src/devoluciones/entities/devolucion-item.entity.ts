import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Devolucion } from './devolucion.entity';

@Entity('devolucion_items')
export class DevolucionItem extends BaseEntity {
  @Column({ name: 'devolucion_id' })
  devolucionId: string;

  @ManyToOne(() => Devolucion, (d) => d.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'devolucion_id' })
  devolucion: Devolucion;

  @Column({ name: 'venta_item_id' })
  ventaItemId: string;

  @Column({ name: 'producto_id' })
  productoId: string;

  @Column({ name: 'nombre_producto' })
  nombreProducto: string;

  /** Misma escala que `VentaItem.cantidad`. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  cantidad: number;

  @Column({ name: 'precio_unitario', type: 'numeric', precision: 12, scale: 2 })
  precioUnitario: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  base: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  impuesto: number;

  @Column({ name: 'descuento_venta', type: 'numeric', precision: 12, scale: 2, default: 0 })
  descuentoVenta: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  total: number;

  @Column({ name: 'vuelve_a_inventario', default: true })
  vuelveAInventario: boolean;

  @Column({ name: 'motivo_baja', type: 'text', nullable: true })
  motivoBaja: string | null;
}
