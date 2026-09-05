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

  /** Se resetea a 0 en cualquier cobro exitoso, automático o manual. Al llegar a 3, el cron de cobro automático marca VENCIDA. */
  @Column({ name: 'intentos_fallidos_cobro', default: 0 })
  intentosFallidosCobro: number;

  /** Etiquetas de qué recordatorios ya se mandaron este ciclo ('DIA_-2'|'DIA_-1'|'DIA_0') — se resetea a [] en activarTrasPago. */
  @Column({ name: 'recordatorios_enviados', type: 'jsonb', default: () => "'[]'" })
  recordatoriosEnviados: string[];

  /**
   * Consumo mensual por feature con cupo numérico en `Paquete` (ej. { documentosDianPorMes: 12 }).
   * Se resetea a {} cuando `consumoMesReferencia` ya no es el mes actual — ver SuscripcionesService.registrarConsumo.
   */
  @Column({ name: 'consumo_mensual', type: 'jsonb', default: () => "'{}'" })
  consumoMensual: Record<string, number>;

  /** Mes de referencia del contador de arriba, formato 'YYYY-MM' (UTC). null antes del primer registrarConsumo. */
  @Column({ name: 'consumo_mes_referencia', type: 'varchar', nullable: true })
  consumoMesReferencia: string | null;

  /** Solo se llena al cancelar explícitamente (ver SuscripcionesService.cancelar) — nunca se borra. */
  @Column({ name: 'motivo_cancelacion', type: 'varchar', nullable: true })
  motivoCancelacion?: string | null;
}
