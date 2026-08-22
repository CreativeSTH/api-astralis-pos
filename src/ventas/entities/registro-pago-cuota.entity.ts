import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Cuota } from './cuota.entity';
import { MetodoPago } from '../../common/enums/venta.enum';

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

  @Column({ name: 'metodo_pago', type: 'enum', enum: MetodoPago })
  metodoPago: MetodoPago;

  @Column({ name: 'referencia_pago', nullable: true })
  referenciaPago?: string;

  @Column({ name: 'registrado_por', nullable: true })
  registradoPor?: string;

  @Column({ nullable: true })
  notas?: string;

  @CreateDateColumn({ name: 'fecha' })
  fecha: Date;
}
