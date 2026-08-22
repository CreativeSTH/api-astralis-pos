import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Venta } from './venta.entity';
import { RegistroPagoCuota } from './registro-pago-cuota.entity';

@Entity('cuotas')
export class Cuota {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'venta_id' })
  ventaId: string;

  @ManyToOne(() => Venta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta: Venta;

  @Column()
  numero: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  monto: number;

  @Column({ name: 'fecha_vencimiento', type: 'date' })
  fechaVencimiento: string;

  @Column({
    name: 'monto_pagado',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  montoPagado: number;

  @Column({ name: 'saldo_pendiente', type: 'numeric', precision: 12, scale: 2 })
  saldoPendiente: number;

  @Column({ default: false })
  pagada: boolean;

  @Column({ name: 'fecha_pago', type: 'timestamptz', nullable: true })
  fechaPago?: Date;

  @Column({ name: 'dias_mora', default: 0 })
  diasMora: number;

  @Column({
    name: 'interes_mora',
    type: 'numeric',
    precision: 5,
    scale: 3,
    default: 0,
  })
  interesMora: number;

  @Column({
    name: 'monto_mora',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  montoMora: number;

  @Column({
    name: 'monto_total_con_mora',
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  montoTotalConMora: number;

  @OneToMany(() => RegistroPagoCuota, (registro) => registro.cuota)
  historialPagos: RegistroPagoCuota[];
}
