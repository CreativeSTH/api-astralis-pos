import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Producto } from '../../productos/entities/producto.entity';
import { Traslado } from './traslado.entity';

@Entity('traslado_items')
@Index('UQ_traslado_items_traslado_producto', ['trasladoId', 'productoId'], { unique: true })
export class TrasladoItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'traslado_id', type: 'uuid' })
  trasladoId: string;

  @ManyToOne(() => Traslado, (t) => t.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'traslado_id' })
  traslado?: Traslado;

  @Column({ name: 'producto_id', type: 'uuid' })
  productoId: string;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto;

  @Column({ name: 'cantidad_enviada', type: 'numeric', precision: 12, scale: 2 })
  cantidadEnviada: number;

  /** null hasta recibir; 0 ≤ recibida ≤ enviada. */
  @Column({ name: 'cantidad_recibida', type: 'numeric', precision: 12, scale: 2, nullable: true })
  cantidadRecibida: number | null;
}
