import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type TipoMovimientoSaldo = 'ABONO_DEVOLUCION' | 'USO_EN_VENTA' | 'AJUSTE';

/** Historial del saldo a favor del cliente: + al devolver, − al usarlo en una venta. */
@Entity('movimientos_saldo_cliente')
export class MovimientoSaldoCliente extends BaseEntity {
  @Index('IDX_movimientos_saldo_cliente_negocio')
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Index('IDX_movimientos_saldo_cliente_cliente')
  @Column({ name: 'cliente_id' })
  clienteId: string;

  @Column({ type: 'varchar' })
  tipo: TipoMovimientoSaldo;

  /** Con signo: positivo suma saldo, negativo lo consume. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  monto: number;

  @Column({ name: 'devolucion_id', type: 'varchar', nullable: true })
  devolucionId: string | null;

  @Column({ name: 'venta_id', type: 'varchar', nullable: true })
  ventaId: string | null;

  @Column({ name: 'creado_por' })
  creadoPor: string;
}
