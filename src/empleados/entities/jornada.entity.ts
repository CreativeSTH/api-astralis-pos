import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Empleado } from './empleado.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { OrigenMarca } from '../enums';

/** Lo trabajado: una fila por pareja entrada/salida (spec 2026-10-04 §3). */
@Entity('jornadas')
@Index('IDX_jornadas_negocio_entrada', ['negocioId', 'entrada'])
@Index('UQ_jornadas_abierta_por_empleado', ['empleadoId'], { unique: true, where: '"salida" IS NULL AND "sin_salida" = false' })
export class Jornada extends BaseEntity {
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'empleado_id', type: 'uuid' })
  empleadoId: string;

  @ManyToOne(() => Empleado, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empleado_id' })
  empleado?: Empleado;

  @Column({ name: 'sucursal_id', type: 'uuid' })
  sucursalId: string;

  @ManyToOne(() => Sucursal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sucursal_id' })
  sucursal?: Sucursal;

  @Column({ type: 'timestamptz' })
  entrada: Date;

  @Column({ type: 'timestamptz', nullable: true })
  salida: Date | null;

  @Column({ name: 'origen_entrada', type: 'enum', enum: OrigenMarca, enumName: 'jornadas_origen_enum' })
  origenEntrada: OrigenMarca;

  @Column({ name: 'origen_salida', type: 'enum', enum: OrigenMarca, enumName: 'jornadas_origen_enum', nullable: true })
  origenSalida: OrigenMarca | null;

  /** Cerrada por olvido (abierta > 16 h): queda para revisión. */
  @Column({ name: 'sin_salida', default: false })
  sinSalida: boolean;

  @Column({ name: 'corregida_por', type: 'varchar', nullable: true })
  corregidaPor: string | null;

  @Column({ name: 'motivo_correccion', type: 'text', nullable: true })
  motivoCorreccion: string | null;
}
