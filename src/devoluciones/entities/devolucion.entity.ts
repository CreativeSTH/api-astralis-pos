import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { DevolucionItem } from './devolucion-item.entity';
import { DevolucionReembolso } from './devolucion-reembolso.entity';

/** Devolución parcial o total de una venta (spec 2026-10-02). Comprobante interno `DEV-n` por sucursal. */
@Entity('devoluciones')
@Index('IDX_devoluciones_negocio_created', ['negocioId', 'createdAt'])
export class Devolucion extends BaseEntity {
  @Index('IDX_devoluciones_negocio')
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'sucursal_id' })
  sucursalId: string;

  @Index('IDX_devoluciones_venta')
  @Column({ name: 'venta_id' })
  ventaId: string;

  /** Turno donde salió el efectivo (si hubo reembolso en efectivo). */
  @Column({ name: 'turno_id', type: 'varchar', nullable: true })
  turnoId: string | null;

  @Column({ type: 'int' })
  numero: number;

  @Column({ name: 'numero_completo' })
  numeroCompleto: string;

  @Column({ type: 'text' })
  motivo: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  total: number;

  @Column({ name: 'base_total', type: 'numeric', precision: 12, scale: 2 })
  baseTotal: number;

  @Column({ name: 'impuesto_total', type: 'numeric', precision: 12, scale: 2 })
  impuestoTotal: number;

  /** Parte del descuento de venta (manual + cupón) que corresponde a lo devuelto. */
  @Column({ name: 'descuento_venta_total', type: 'numeric', precision: 12, scale: 2, default: 0 })
  descuentoVentaTotal: number;

  @Column({ name: 'creado_por' })
  creadoPor: string;

  @Column({ name: 'autorizado_por' })
  autorizadoPor: string;

  @OneToMany(() => DevolucionItem, (i) => i.devolucion, { cascade: true })
  items: DevolucionItem[];

  @OneToMany(() => DevolucionReembolso, (r) => r.devolucion, { cascade: true })
  reembolsos: DevolucionReembolso[];
}
