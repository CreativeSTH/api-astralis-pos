import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type OrigenContingencia = 'AUTOMATICA' | 'MANUAL' | 'SIN_CONEXION';

/**
 * Un período de "inconveniente tecnológico del facturador" (Res. DIAN 000227 de 2025, art. 1.5.1.5.7.1,
 * num. 1.1): mientras está abierto, cada factura electrónica sale como factura de talonario o de papel
 * con la numeración de contingencia; al cerrarse, corren las 48 h para transmitirlas. Es además la
 * evidencia del inconveniente (art. 1.5.1.5.9.3, parágrafo: el papel solo vale si lo hubo).
 */
@Entity('periodos_contingencia')
@Index('IDX_periodos_contingencia_negocio_inicio', ['negocioId', 'inicio'])
// Como máximo un período abierto por negocio.
@Index('UQ_periodos_contingencia_abierto', ['negocioId'], { unique: true, where: '"fin" IS NULL' })
@Index('UQ_periodos_contingencia_episodio', ['episodioId'], { unique: true, where: '"episodio_id" IS NOT NULL' })
export class PeriodoContingencia extends BaseEntity {
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ type: 'timestamptz' })
  inicio: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fin: Date | null;

  @Column({ type: 'varchar' })
  origen: OrigenContingencia;

  @Column({ type: 'varchar' })
  motivo: string;

  /** usuarioId; null si la abrió AURA sola. */
  @Column({ name: 'declarado_por', type: 'varchar', nullable: true })
  declaradoPor: string | null;

  /** usuarioId; null si la cerró AURA sola. */
  @Column({ name: 'finalizado_por', type: 'varchar', nullable: true })
  finalizadoPor: string | null;

  /** Cuándo el negocio marcó enviada la carta de inicio a contingencia.facturadorvp@dian.gov.co. */
  @Column({ name: 'aviso_inicio_en', type: 'timestamptz', nullable: true })
  avisoInicioEn: Date | null;

  @Column({ name: 'aviso_fin_en', type: 'timestamptz', nullable: true })
  avisoFinEn: Date | null;

  /** Fase 6b: episodio sin conexión de una caja (id generado por el pos-agent). */
  @Column({ name: 'episodio_id', type: 'varchar', nullable: true })
  episodioId: string | null;
}
