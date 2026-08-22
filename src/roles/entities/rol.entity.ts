import {
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { RolTier } from '../../common/enums/rol-tier.enum';
import { Permiso } from './permiso.entity';

@Entity('roles')
export class Rol extends BaseEntity {
  @Column()
  nombre: string;

  @Column({ nullable: true })
  descripcion?: string;

  @Column({ type: 'enum', enum: RolTier })
  tier: RolTier;

  /** null solo cuando tier === SISTEMA (rol de plataforma, no ligado a un negocio). */
  @Index()
  @Column({ name: 'negocio_id', nullable: true })
  negocioId: string | null;

  @ManyToOne(() => Negocio, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'negocio_id' })
  negocio?: Negocio;

  /** Roles sembrados (Cajero/Administrador/Super Administrador) — protegidos contra borrado, no contra edición de permisos. */
  @Column({ name: 'es_default', default: false })
  esDefault: boolean;

  @Column({ default: true })
  activo: boolean;

  @ManyToMany(() => Permiso)
  @JoinTable({
    name: 'rol_permisos',
    joinColumn: { name: 'rol_id' },
    inverseJoinColumn: { name: 'permiso_id' },
  })
  permisos: Permiso[];
}
