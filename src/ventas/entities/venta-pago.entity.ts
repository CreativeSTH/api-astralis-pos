import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Venta } from './venta.entity';
import { MetodoPago } from '../../common/enums/venta.enum';

@Entity('venta_pagos')
export class VentaPago {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'venta_id' })
  ventaId: string;

  @ManyToOne(() => Venta, (venta) => venta.pagos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta: Venta;

  @Column({ name: 'metodo_pago', type: 'enum', enum: MetodoPago })
  metodoPago: MetodoPago;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  monto: number;

  @Column({ nullable: true })
  referencia?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
