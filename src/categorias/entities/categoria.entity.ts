import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('categorias')
export class Categoria extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column()
  nombre: string;

  /** Si tiene valor, esta categoría es una sub-categoría de otra. */
  @Column({ name: 'categoria_padre_id', nullable: true })
  categoriaPadreId?: string;

  @ManyToOne(() => Categoria, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'categoria_padre_id' })
  categoriaPadre?: Categoria;

  @Column({ default: true })
  activo: boolean;
}
