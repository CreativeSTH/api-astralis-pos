import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type MetodoPagoSuscripcion = 'QR' | 'NEQUI' | 'PSE' | 'TARJETA';
export type EstadoTransaccionSuscripcion = 'PENDIENTE' | 'APROBADA' | 'DECLINADA';

/** Cobro de la PLATAFORMA al negocio (reactivación) — distinta de TransaccionPago, que es el negocio cobrándole a SUS propios clientes. */
@Entity('transacciones_suscripcion')
export class TransaccionSuscripcion extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'paquete_id' })
  paqueteId: string;

  @Index({ unique: true })
  @Column()
  referencia: string;

  @Column({ name: 'wompi_transaction_id', nullable: true })
  wompiTransactionId?: string;

  @Column({ name: 'metodo_pago' })
  metodoPago: MetodoPagoSuscripcion;

  @Column({ default: 'PENDIENTE' })
  estado: EstadoTransaccionSuscripcion;

  @Column({ name: 'monto_en_centavos' })
  montoEnCentavos: number;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt?: Date;

  /** Distingue un cobro disparado por el usuario (reactivar a mano) de uno disparado por el cron diario. */
  @Column({ default: 'MANUAL' })
  origen: 'MANUAL' | 'AUTOMATICO';
}
