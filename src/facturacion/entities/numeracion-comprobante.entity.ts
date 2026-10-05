import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipoNumeracion } from '../../common/enums/tipo-comprobante.enum';
import { Auditable } from '../../auditoria/auditable.decorator';
import { ModuloPermiso } from '../../common/enums/modulo-permiso.enum';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';

/** Numeración secuencial por sucursal+tipo (recibos, recibos de caja y el rango de la factura convencional histórica). */
@Auditable<NumeracionComprobante>({
  modulo: ModuloPermiso.FACTURACION,
  nombre: 'la numeración',
  etiqueta: (n) =>
    `Numeración de ${{ RECIBO: 'recibos', FACTURA: 'facturas', RECIBO_CAJA: 'recibos de caja', DEVOLUCION: 'devoluciones' }[n.tipo] ?? n.tipo}${n.prefijo ? ` (${n.prefijo})` : ''}`,
  campos: {
    sucursalId: { label: 'Sucursal', formato: 'relacion', entidad: () => Sucursal },
    prefijo: { label: 'Prefijo' },
    rangoDesde: { label: 'Rango desde', formato: 'numero' },
    rangoHasta: { label: 'Rango hasta', formato: 'numero' },
    resolucionDianRef: { label: 'Resolución DIAN' },
  },
})
@Entity('numeraciones_comprobante')
@Unique(['sucursalId', 'tipo'])
export class NumeracionComprobante extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'sucursal_id' })
  sucursalId: string;

  @Column({ type: 'enum', enum: TipoNumeracion })
  tipo: TipoNumeracion;

  @Column({ nullable: true })
  prefijo?: string;

  @Column({ name: 'siguiente_numero', default: 1 })
  siguienteNumero: number;

  /** Solo se valida contra esto para FACTURA — refleja el rango autorizado de la resolución DIAN. */
  @Column({ name: 'rango_desde', nullable: true })
  rangoDesde?: number;

  @Column({ name: 'rango_hasta', nullable: true })
  rangoHasta?: number;

  /** Copia denormalizada de auditoría — de qué resolución viene este rango. */
  @Column({ name: 'resolucion_dian_ref', nullable: true })
  resolucionDianRef?: string;
}
