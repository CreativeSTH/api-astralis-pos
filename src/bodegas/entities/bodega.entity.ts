import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';

@Entity('bodegas')
export class Bodega extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'sucursal_id' })
  sucursalId: string;

  @ManyToOne(() => Sucursal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sucursal_id' })
  sucursal: Sucursal;

  @Column()
  nombre: string;

  @Column({ default: true })
  activo: boolean;
}
