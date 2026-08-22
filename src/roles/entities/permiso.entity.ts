import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { ModuloPermiso } from '../../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../../common/enums/accion-permiso.enum';
import { RolTier } from '../../common/enums/rol-tier.enum';

/** Catálogo global e inmutable (16 módulos × 4 acciones) — reference data, no lleva negocioId. */
@Entity('permisos')
@Index(['modulo', 'accion'], { unique: true })
export class Permiso extends BaseEntity {
  @Column({ type: 'enum', enum: ModuloPermiso })
  modulo: ModuloPermiso;

  @Column({ type: 'enum', enum: AccionPermiso })
  accion: AccionPermiso;

  /** Denormalizado desde el módulo: NEGOCIOS = SISTEMA, todo lo demás = NEGOCIO. */
  @Column({ type: 'enum', enum: RolTier })
  tier: RolTier;
}
