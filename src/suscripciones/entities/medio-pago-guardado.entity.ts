import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('medios_pago_guardados')
export class MedioPagoGuardado extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'negocio_id' })
  negocioId: string;

  /**
   * Referencia numérica que Wompi devuelve al crear la fuente de pago
   * (`POST /payment_sources` → `data.id`) — no es dato sensible en sí (no es
   * el número de tarjeta), no requiere cifrado en reposo.
   */
  @Column({ name: 'wompi_payment_source_id' })
  wompiPaymentSourceId: number;

  @Column({ name: 'ultimos_cuatro_digitos' })
  ultimosCuatroDigitos: string;

  @Column({ default: true })
  activo: boolean;
}
