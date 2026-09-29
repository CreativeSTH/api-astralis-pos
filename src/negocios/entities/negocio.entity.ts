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

  @Column({ name: 'ciudad_nombre', nullable: true })
  ciudadNombre?: string;

  @Column({ name: 'ciudad_codigo', nullable: true })
  ciudadCodigo?: string;

  @Column({ name: 'departamento_codigo', nullable: true })
  departamentoCodigo?: string;

  /** Logo oficial del negocio (ruta relativa `/uploads/negocios/logos/...`) — lo usa el PDF de factura electrónica. */
  @Column({ name: 'logo_url', type: 'varchar', nullable: true })
  logoUrl?: string | null;

  @Column({ type: 'enum', enum: PlanNegocio, default: PlanNegocio.FREE })
  plan: PlanNegocio;

  @Column({ default: true })
  activo: boolean;
}
