import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Negocio } from '../../negocios/entities/negocio.entity';

@Entity('sucursales')
export class Sucursal extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @ManyToOne(() => Negocio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'negocio_id' })
  negocio: Negocio;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  direccion?: string;

  @Column({ nullable: true })
  telefono?: string;

  /** 0/null = sin meta definida — no se evalúa la alerta de meta no alcanzada. */
  @Column({
    name: 'meta_ventas_diaria',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  metaVentasDiaria?: number;

  @Column({ default: true })
  activo: boolean;
}
