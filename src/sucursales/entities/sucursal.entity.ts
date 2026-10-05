import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Bodega } from '../../bodegas/entities/bodega.entity';
import { Auditable } from '../../auditoria/auditable.decorator';
import { ModuloPermiso } from '../../common/enums/modulo-permiso.enum';

@Auditable<Sucursal>({
  modulo: ModuloPermiso.SUCURSALES,
  nombre: 'la sucursal',
  etiqueta: (s) => s.nombre,
  campos: {
    nombre: { label: 'Nombre' },
    direccion: { label: 'Dirección' },
    telefono: { label: 'Teléfono' },
    metaVentasDiaria: { label: 'Meta de ventas diaria', formato: 'moneda' },
    bodegaOperativaId: { label: 'Bodega operativa', formato: 'relacion', entidad: () => Bodega },
    activo: { label: 'Activa', formato: 'booleano' },
  },
})
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

  /**
   * Bodega con la que esta sucursal vende por defecto — resuelve sin ambigüedad "la bodega de
   * esta sucursal" para el punto de venta y otras pantallas cuando hay más de una. Se asigna sola
   * a la primera bodega que se crea para la sucursal (`BodegasService.create`); de ahí en más,
   * cambiarla es una acción explícita (`/sucursales` o el asistente de configuración).
   */
  @Column({ name: 'bodega_operativa_id', nullable: true })
  bodegaOperativaId?: string;

  @ManyToOne(() => Bodega, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'bodega_operativa_id' })
  bodegaOperativa?: Bodega;
}
