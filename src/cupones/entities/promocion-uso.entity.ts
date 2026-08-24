import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Promocion } from './promocion.entity';

/**
 * Registro de cada redención — no un contador mutable en `Promocion.usoMaximo`,
 * para poder contar de forma atómica bajo lock pesimista (mismo motivo que
 * `MovimientoInventario` existe en vez de solo mutar `Inventario.cantidad`).
 */
@Entity('promociones_uso')
export class PromocionUso extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'promocion_id' })
  promocionId: string;

  @ManyToOne(() => Promocion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promocion_id' })
  promocion: Promocion;

  @Column({ name: 'venta_id' })
  ventaId: string;

  @Column({ name: 'sucursal_id' })
  sucursalId: string;

  @Column({ name: 'monto_descontado', type: 'numeric', precision: 12, scale: 2 })
  montoDescontado: number;
}
