import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('metodos_pago')
export class MetodoPago extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column()
  nombre: string;

  /** Solo un método por negocio puede tener esto en true — rige el cálculo de vuelto en el POS y el conteo físico de caja. */
  @Column({ name: 'es_efectivo', default: false })
  esEfectivo: boolean;

  @Column({ default: true })
  activo: boolean;
}
