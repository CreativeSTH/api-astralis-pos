import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Empleado } from './empleado.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';

/** Turno planeado. `horaFin <= horaInicio` = cruza la medianoche. */
@Entity('turnos_programados')
@Index('IDX_turnos_programados_negocio_fecha', ['negocioId', 'fecha'])
export class TurnoProgramado extends BaseEntity {
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

  /** Día en hora Colombia, 'YYYY-MM-DD'. */
  @Column({ type: 'date' })
  fecha: string;

  /** 'HH:MM:SS' */
  @Column({ name: 'hora_inicio', type: 'time' })
  horaInicio: string;

  @Column({ name: 'hora_fin', type: 'time' })
  horaFin: string;

  @Column({ type: 'varchar', nullable: true })
  nota: string | null;
}
