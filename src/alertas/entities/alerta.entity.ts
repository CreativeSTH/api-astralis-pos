import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipoAlerta, SeveridadAlerta } from '../../common/enums/alerta.enum';

@Entity('alertas')
export class Alerta extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ type: 'enum', enum: TipoAlerta })
  tipo: TipoAlerta;

  @Column({ type: 'enum', enum: SeveridadAlerta })
  severidad: SeveridadAlerta;

  @Column({ name: 'referencia_id', nullable: true })
  referenciaId?: string;

  /** Solo poblado en alertas de stock (STOCK_BAJO/PRODUCTO_AGOTADO) — permite
   * ofrecer acciones directas ("Añadir a lista de pedidos") sin tener que
   * resolver `referenciaId` (el id del Inventario) de vuelta al producto. */
  @Column({ name: 'producto_id', nullable: true })
  productoId?: string;

  /** Solo poblado en alertas tipo REGLA — de qué `ReglaAlerta` salió. */
  @Column({ name: 'regla_id', nullable: true })
  reglaId?: string;

  @Column()
  mensaje: string;

  @Column({ default: false })
  leida: boolean;

  @Column({ default: false })
  resuelta: boolean;

  /** Distinto de `resuelta`: permite silenciar una alerta (típicamente una
   * personalizada) sin marcarla como atendida — el cron nunca la reactiva. */
  @Column({ default: true })
  activa: boolean;
}
