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

  @CreateDateColumn({ name: 'fecha' })
  fecha: Date;
}
