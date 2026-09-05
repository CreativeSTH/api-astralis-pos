import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Venta } from './venta.entity';
import { Producto } from '../../productos/entities/producto.entity';

@Entity('venta_items')
export class VentaItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'venta_id' })
  ventaId: string;

  @ManyToOne(() => Venta, (venta) => venta.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta: Venta;

  @Column({ name: 'producto_id' })
  productoId: string;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'producto_id' })
  producto: Producto;

  @Column({ name: 'nombre_producto' })
  nombreProducto: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  cantidad: number;

  @Column({ name: 'precio_unitario', type: 'numeric', precision: 12, scale: 2 })
  precioUnitario: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  descuento: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  subtotal: number;

  /** Valor de la línea SIN impuesto — snapshot calculado en `procesarItemsYStock`, mismo patrón que `precioUnitario`/`costoUnitario`. Default 0 solo para no romper filas de ventas ya existentes al migrar; toda venta nueva lo calcula siempre. */
  @Column({ name: 'base_imponible', type: 'numeric', precision: 12, scale: 2, default: 0 })
  baseImponible: number;

  /** Impuesto de la línea — `subtotal = baseImponible + impuesto`. */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  impuesto: number;

  @Column({ name: 'costo_unitario', type: 'numeric', precision: 12, scale: 2 })
  costoUnitario: number;

  /** Promoción automática (tipo=PROMOCION) que fijó `precioUnitario`, si aplicó alguna. */
  @Column({ name: 'promocion_id', nullable: true })
  promocionId?: string;
}
