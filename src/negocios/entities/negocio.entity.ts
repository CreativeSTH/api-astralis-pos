import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum PlanNegocio {
  FREE = 'FREE',
  BASICO = 'BASICO',
  PRO = 'PRO',
}

@Entity('negocios')
export class Negocio extends BaseEntity {
  @Column()
  nombre: string;

  @Column({ nullable: true })
  nit?: string;

  @Column({ name: 'tipo_negocio', nullable: true })
  tipoNegocio?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  telefono?: string;

  @Column({ nullable: true })
  direccion?: string;

  @Column({ type: 'enum', enum: PlanNegocio, default: PlanNegocio.FREE })
  plan: PlanNegocio;

  @Column({ default: true })
  activo: boolean;
}
