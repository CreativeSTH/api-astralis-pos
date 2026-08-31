import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { EstadoSuscripcion } from './estado-suscripcion.enum';
import { Paquete } from '../../paquetes/entities/paquete.entity';

@Entity('suscripciones')
export class Suscripcion extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'paquete_id' })
  paqueteId: string;

  @ManyToOne(() => Paquete)
  @JoinColumn({ name: 'paquete_id' })
  paquete?: Paquete;

  @Column({ type: 'enum', enum: EstadoSuscripcion })
  estado: EstadoSuscripcion;

  @Column({ name: 'fecha_inicio', type: 'timestamptz' })
  fechaInicio: Date;

  /**
   * null = sin vencimiento — caso de los negocios creados por SISTEMA (nunca
   * pasaron por una prueba) y de los ya existentes al momento de esta
   * migración (backfill, ver Task 2). PRUEBA siempre tiene fecha (inicio+20d);
   * ACTIVA tras reactivar tiene fecha (pago+30d); ACTIVA sin fecha es el caso
   * "sin vencimiento" de arriba.
   */
  @Column({ name: 'fecha_fin', type: 'timestamptz', nullable: true })
  fechaFin: Date | null;
}
