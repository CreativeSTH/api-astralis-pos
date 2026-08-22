import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Producto } from '../../productos/entities/producto.entity';
import { Bodega } from '../../bodegas/entities/bodega.entity';
import { TipoMovimientoInventario } from '../../common/enums/tipo-movimiento-inventario.enum';

@Entity('movimientos_inventario')
export class MovimientoInventario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ type: 'enum', enum: TipoMovimientoInventario })
  tipo: TipoMovimientoInventario;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  cantidad: number;

  @Column({ nullable: true })
  motivo?: string;

  @Column({ name: 'venta_id', nullable: true })
  ventaId?: string;

  @Column({ name: 'creado_por', nullable: true })
  creadoPor?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
