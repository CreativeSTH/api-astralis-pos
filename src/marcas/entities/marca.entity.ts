import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('marcas')
export class Marca extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column()
  nombre: string;

  /** Si tiene valor, esta marca es una sub-marca de otra (ej. "Royal Canin Veterinary" de "Royal Canin"). */
  @Column({ name: 'marca_padre_id', nullable: true })
  marcaPadreId?: string;

  @ManyToOne(() => Marca, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'marca_padre_id' })
  marcaPadre?: Marca;

  @Column({ default: true })
  activo: boolean;
}
