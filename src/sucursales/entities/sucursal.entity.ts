import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { TipoComprobante } from '../../common/enums/tipo-comprobante.enum';

@Entity('sucursales')
export class Sucursal extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @ManyToOne(() => Negocio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'negocio_id' })
  negocio: Negocio;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  direccion?: string;

  @Column({ nullable: true })
  telefono?: string;

  /** 0/null = sin meta definida — no se evalúa la alerta de meta no alcanzada. */
  @Column({
    name: 'meta_ventas_diaria',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  metaVentasDiaria?: number;

  @Column({ default: true })
  activo: boolean;

  /** Qué se expide por defecto al cobrar en esta sucursal si el cajero no elige explícitamente. */
  @Column({
    name: 'tipo_comprobante_defecto',
    type: 'enum',
    enum: TipoComprobante,
    default: TipoComprobante.RECIBO,
  })
  tipoComprobanteDefecto: TipoComprobante;

  /** Si no está seteada, se usa la plantilla `esPredeterminada` del negocio para ese tipo (ver ComprobantesService, Fase D). */
  @Column({ name: 'plantilla_recibo_defecto_id', nullable: true })
  plantillaReciboDefectoId?: string;

  @Column({ name: 'plantilla_factura_defecto_id', nullable: true })
  plantillaFacturaDefectoId?: string;
}
