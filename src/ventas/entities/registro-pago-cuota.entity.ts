import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Cuota } from './cuota.entity';

@Entity('registros_pago_cuota')
export class RegistroPagoCuota {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cuota_id' })
  cuotaId: string;

  @ManyToOne(() => Cuota, (cuota) => cuota.historialPagos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'cuota_id' })
  cuota: Cuota;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  monto: number;

  /** Nombre del método de pago tal cual estaba en el catálogo del negocio al momento del abono (denormalizado). */
  @Column({ name: 'metodo_pago' })
  metodoPago: string;

  @Column({ name: 'referencia_pago', nullable: true })
  referenciaPago?: string;

  @Column({ name: 'registrado_por', nullable: true })
  registradoPor?: string;

  @Column({ nullable: true })
  notas?: string;

  /** Recibo de caja del abono (`RC-12`) — null en abonos anteriores a los recibos de caja. */
  @Column({ name: 'numero_recibo', type: 'varchar', nullable: true })
  numeroRecibo?: string | null;

  /** Sucursal cuya secuencia numeró el recibo (la de la venta). */
  @Column({ name: 'sucursal_id', type: 'varchar', nullable: true })
  sucursalId?: string | null;

  /** Foto del momento del abono, para reimprimir el recibo tal cual salió. */
  @Column({ name: 'mora_pagada', type: 'numeric', precision: 12, scale: 2, default: 0 })
  moraPagada: number;

  @Column({ name: 'saldo_venta_anterior', type: 'numeric', precision: 12, scale: 2, nullable: true })
  saldoVentaAnterior?: number | null;

  @Column({ name: 'saldo_venta_nuevo', type: 'numeric', precision: 12, scale: 2, nullable: true })
  saldoVentaNuevo?: number | null;

  @CreateDateColumn({ name: 'fecha' })
  fecha: Date;
}
