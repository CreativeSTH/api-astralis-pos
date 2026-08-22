import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Producto } from '../../productos/entities/producto.entity';
import { Bodega } from '../../bodegas/entities/bodega.entity';

@Entity('inventarios')
@Unique(['productoId', 'bodegaId'])
export class Inventario extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'producto_id' })
  productoId: string;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto: Producto;

  @Column({ name: 'bodega_id' })
  bodegaId: string;

  @ManyToOne(() => Bodega, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bodega_id' })
  bodega: Bodega;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  cantidad: number;

  @Column({
    name: 'stock_minimo',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  stockMinimo: number;
}
