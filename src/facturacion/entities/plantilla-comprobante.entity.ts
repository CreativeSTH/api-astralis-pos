import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipoComprobante } from '../../common/enums/tipo-comprobante.enum';

export interface CampoExtraDian {
  etiqueta: string;
  valor: string;
}

/**
 * Campos informativos, tipeados a mano por el negocio — NO configuran
 * facturación electrónica ante la DIAN (ver disclaimer en el wizard).
 * Solo aplican cuando `tipo` de la plantilla es FACTURA.
 */
export interface DatosDianPlantilla {
  resolucionNumero?: string;
  prefijo?: string;
  rangoDesde?: number;
  rangoHasta?: number;
  fechaVigencia?: string;
  regimenFiscal?: string;
  camposExtra?: CampoExtraDian[];
}

export interface ConfiguracionPlantilla {
  nombrePersonaNatural?: string;
  direccion?: string;
  telefono?: string;
  mensajeCierre?: string;
  terminos?: string;
  dian?: DatosDianPlantilla;
}

@Entity('plantillas_comprobante')
export class PlantillaComprobante extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ type: 'enum', enum: TipoComprobante })
  tipo: TipoComprobante;

  @Column()
  nombre: string;

  /**
   * Default a nivel de negocio (una sola por `negocioId`+`tipo` — mismo patrón
   * que `MetodoPago.esEfectivo`, el service desmarca las demás al guardar).
   * Una sucursal puede además pisar este default vía
   * `Sucursal.plantillaReciboDefectoId`/`plantillaFacturaDefectoId` (Fase C).
   */
  @Column({ name: 'es_predeterminada', default: false })
  esPredeterminada: boolean;

  @Column({ name: 'logo_url', nullable: true })
  logoUrl?: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  configuracion: ConfiguracionPlantilla;

  @Column({ default: true })
  activo: boolean;

  @Column({ name: 'creado_por', nullable: true })
  creadoPor?: string;
}
