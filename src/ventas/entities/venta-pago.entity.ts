import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Venta } from './venta.entity';

@Entity('venta_pagos')
export class VentaPago {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'venta_id' })
  ventaId: string;

  @ManyToOne(() => Venta, (venta) => venta.pagos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta: Venta;

  /** Nombre del método de pago tal cual estaba en el catálogo del negocio al momento de la venta (denormalizado). */
  @Column({ name: 'metodo_pago' })
  metodoPago: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  monto: number;

  @Column({ nullable: true })
  referencia?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
