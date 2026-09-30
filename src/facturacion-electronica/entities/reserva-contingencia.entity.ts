import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * Bloque de números de contingencia reservado para una caja (fase 6b): la caja los usa sin conexión
 * para imprimir facturas de papel. Guarda la resolución vigente al reservar, que es la que se imprime.
 */
@Entity('reservas_contingencia')
@Index('IDX_reservas_contingencia_negocio_terminal', ['negocioId', 'terminalId'])
export class ReservaContingencia extends BaseEntity {
  @Column({ name: 'negocio_id' })
  negocioId: string;

  /** Identificador del pos-agent de la caja (UUID que el agente genera una vez). */
  @Column({ name: 'terminal_id', type: 'varchar' })
  terminalId: string;

  @Column({ type: 'int' })
  desde: number;

  @Column({ type: 'int' })
  hasta: number;

  @Column({ name: 'resolucion_numero', type: 'varchar' })
  resolucionNumero: string;

  @Column({ type: 'varchar' })
  prefijo: string;

  @Column({ name: 'fecha_inicio', type: 'date' })
  fechaInicio: string;

  @Column({ name: 'fecha_fin', type: 'date' })
  fechaFin: string;

  @Column({ name: 'rango_desde', type: 'int' })
  rangoDesde: number;

  @Column({ name: 'rango_hasta', type: 'int' })
  rangoHasta: number;
}
