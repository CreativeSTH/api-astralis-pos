import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Bodega } from '../../bodegas/entities/bodega.entity';

@Entity('tiendas_online')
export class TiendaOnline extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'bodega_id', nullable: true })
  bodegaId: string | null;

  @ManyToOne(() => Bodega, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'bodega_id' })
  bodega: Bodega | null;

  @Column({ default: false })
  activo: boolean;
}
