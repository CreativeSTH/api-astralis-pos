import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Bodega } from '../../bodegas/entities/bodega.entity';
import { EstadoTraslado } from '../../common/enums/estado-traslado.enum';
import { TrasladoItem } from './traslado-item.entity';

/** Movimiento de mercancía entre dos bodegas en dos pasos: envío y recepción (spec 2026-10-04 §5). */
@Entity('traslados')
@Index('UQ_traslados_negocio_consecutivo', ['negocioId', 'consecutivo'], { unique: true })
export class Traslado extends BaseEntity {
  @Index('IDX_traslados_negocio')
  @Column({ name: 'negocio_id' })
  negocioId: string;

  /** No usa NumeracionComprobanteService: esa es por sucursal y un CEDI no tiene sucursal. */
  @Column({ type: 'int' })
  consecutivo: number;

  @Column({ name: 'bodega_origen_id', type: 'uuid' })
  bodegaOrigenId: string;

  @ManyToOne(() => Bodega)
  @JoinColumn({ name: 'bodega_origen_id' })
  bodegaOrigen?: Bodega;

  @Column({ name: 'bodega_destino_id', type: 'uuid' })
  bodegaDestinoId: string;

  @ManyToOne(() => Bodega)
  @JoinColumn({ name: 'bodega_destino_id' })
  bodegaDestino?: Bodega;

  @Column({ type: 'enum', enum: EstadoTraslado, default: EstadoTraslado.EN_TRANSITO })
  estado: EstadoTraslado;

  @Column({ type: 'text', nullable: true })
  nota: string | null;

  @Column({ name: 'enviado_por' })
  enviadoPor: string;

  @Column({ name: 'enviado_en', type: 'timestamptz' })
  enviadoEn: Date;

  @Column({ name: 'recibido_por', type: 'varchar', nullable: true })
  recibidoPor: string | null;

  @Column({ name: 'recibido_en', type: 'timestamptz', nullable: true })
  recibidoEn: Date | null;

  @Column({ name: 'cancelado_por', type: 'varchar', nullable: true })
  canceladoPor: string | null;

  @Column({ name: 'cancelado_en', type: 'timestamptz', nullable: true })
  canceladoEn: Date | null;

  @OneToMany(() => TrasladoItem, (i) => i.traslado, { cascade: true })
  items: TrasladoItem[];
}
