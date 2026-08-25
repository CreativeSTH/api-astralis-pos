import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type MetodoPagoWompi = 'QR' | 'NEQUI' | 'PSE' | 'TARJETA';
export type EstadoTransaccionPago =
  'PENDIENTE' | 'APROBADA' | 'DECLINADA' | 'ERROR' | 'EXPIRADA';

@Entity('transacciones_pago')
export class TransaccionPago {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  negocioId: string;

  @Index({ unique: true })
  @Column()
  referencia: string;

  @Column({ nullable: true })
  wompiTransactionId: string;

  @Column({ type: 'varchar' })
  metodoPago: MetodoPagoWompi;

  @Column({ type: 'varchar', default: 'PENDIENTE' })
  estado: EstadoTransaccionPago;

  @Column({ type: 'int' })
  montoEnCentavos: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  confirmedAt: Date;
}
