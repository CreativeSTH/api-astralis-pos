import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipoComprobante } from '../../common/enums/tipo-comprobante.enum';

/**
 * Numeración secuencial por sucursal+tipo — deliberadamente separada de
 * `PlantillaComprobante` (que es cosmética) para que cambiar cuál plantilla
 * es la predeterminada nunca resetee/huerfane una secuencia ya numerada.
 * Se llena/usa recién en Fase C (transaccional, dentro de `VentasService`).
 */
@Entity('numeraciones_comprobante')
@Unique(['sucursalId', 'tipo'])
export class NumeracionComprobante extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'sucursal_id' })
  sucursalId: string;

  @Column({ type: 'enum', enum: TipoComprobante })
  tipo: TipoComprobante;

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
