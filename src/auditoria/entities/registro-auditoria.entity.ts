import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ModuloPermiso } from '../../common/enums/modulo-permiso.enum';
import { AccionAuditoria } from '../enums/accion-auditoria.enum';
import { OrigenAuditoria } from '../enums/origen-auditoria.enum';
import type { CambioAuditoria } from '../auditoria.types';

/** Inmutable (spec auditoría §2): sin updatedAt, sin endpoints de escritura. */
@Entity('registros_auditoria')
@Index('IDX_registros_auditoria_negocio_created', ['negocioId', 'createdAt'])
@Index('IDX_registros_auditoria_entidad', [
  'negocioId',
  'entidad',
  'entidadId',
  'createdAt',
])
export class RegistroAuditoria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'usuario_id', type: 'varchar', nullable: true })
  usuarioId: string | null;

  /** Snapshot: sigue legible aunque el usuario cambie de nombre o se desactive. */
  @Column({ name: 'usuario_nombre', type: 'varchar', nullable: true })
  usuarioNombre: string | null;

  @Column({ type: 'enum', enum: OrigenAuditoria })
  origen: OrigenAuditoria;

  @Column({ name: 'sucursal_id', type: 'varchar', nullable: true })
  sucursalId: string | null;

  @Column({ type: 'enum', enum: ModuloPermiso })
  modulo: ModuloPermiso;

  @Column()
  entidad: string;

  @Column({ name: 'entidad_id' })
  entidadId: string;

  @Column({ name: 'entidad_etiqueta' })
  entidadEtiqueta: string;

  @Column({ type: 'enum', enum: AccionAuditoria })
  accion: AccionAuditoria;

  @Column({ type: 'text' })
  descripcion: string;

  @Column({ type: 'jsonb', nullable: true })
  cambios: CambioAuditoria[] | null;
}
