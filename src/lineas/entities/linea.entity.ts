import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Marca } from '../../marcas/entities/marca.entity';

/** Línea de producto dentro de una marca (ej. "Veterinary Diet" de Royal Canin). */
@Entity('lineas')
export class Linea extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'marca_id' })
  marcaId: string;

  @ManyToOne(() => Marca, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marca_id' })
  marca: Marca;

  @Column()
  nombre: string;

  @Column({ default: true })
  activo: boolean;
}
