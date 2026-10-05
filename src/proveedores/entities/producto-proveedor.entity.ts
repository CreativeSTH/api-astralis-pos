import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { Proveedor } from './proveedor.entity';
import { Auditable } from '../../auditoria/auditable.decorator';
import { ModuloPermiso } from '../../common/enums/modulo-permiso.enum';

/** Vínculo producto↔proveedor con el costo pactado — un producto puede tener varios proveedores, cada uno con su propio costo. */
@Auditable<ProductoProveedor>({
  modulo: ModuloPermiso.PROVEEDORES,
  nombre: 'el vínculo producto-proveedor',
  etiqueta: (v) => v.producto?.nombre ?? v.referencia ?? 'Producto de proveedor',
  campos: {
    productoId: { label: 'Producto', formato: 'relacion', entidad: () => Producto },
    proveedorId: { label: 'Proveedor', formato: 'relacion', entidad: () => Proveedor },
    costo: { label: 'Costo', formato: 'moneda' },
    referencia: { label: 'Referencia' },
    activo: { label: 'Activo', formato: 'booleano' },
  },
})
@Entity('producto_proveedores')
@Index(['negocioId', 'productoId', 'proveedorId'], { unique: true })
export class ProductoProveedor extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'producto_id' })
  productoId: string;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto;

  @Column({ name: 'proveedor_id' })
  proveedorId: string;

  @ManyToOne(() => Proveedor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor?: Proveedor;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  costo: number;

  /** Código/referencia del producto en el catálogo del proveedor, si aplica. */
  @Column({ nullable: true })
  referencia?: string;

  @Column({ default: true })
  activo: boolean;
}
