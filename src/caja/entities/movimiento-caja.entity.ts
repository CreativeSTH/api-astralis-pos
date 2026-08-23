import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TurnoCaja } from './turno-caja.entity';
import { TipoMovimientoCaja } from '../../common/enums/caja.enum';

@Entity('movimientos_caja')
export class MovimientoCaja {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'turno_id' })
  turnoId: string;

  @ManyToOne(() => TurnoCaja, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'turno_id' })
  turno: TurnoCaja;

  @Column({ type: 'enum', enum: TipoMovimientoCaja })
  tipo: TipoMovimientoCaja;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  monto: number;

  @Column({ nullable: true })
  concepto?: string;

  /** Nombre del método de pago tal cual estaba en el catálogo del negocio al momento del movimiento (denormalizado). */
  @Column({ name: 'metodo_pago', nullable: true })
  metodoPago?: string;

  @Column({ name: 'venta_id', nullable: true })
  ventaId?: string;

  @Column({ name: 'creado_por', nullable: true })
  creadoPor?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
