import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Devolucion } from './devolucion.entity';
import type { FormaReembolso } from '../devolucion.logic';

@Entity('devolucion_reembolsos')
export class DevolucionReembolso extends BaseEntity {
  @Column({ name: 'devolucion_id' })
  devolucionId: string;

  @ManyToOne(() => Devolucion, (d) => d.reembolsos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'devolucion_id' })
  devolucion: Devolucion;

  @Column({ type: 'varchar' })
  forma: FormaReembolso;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  monto: number;
}
