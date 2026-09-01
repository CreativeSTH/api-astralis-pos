import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { EstadoHabilitacion } from './estado-habilitacion.enum';

@Entity('habilitaciones_facturacion_electronica')
export class HabilitacionFacturacionElectronica extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ type: 'enum', enum: EstadoHabilitacion, default: EstadoHabilitacion.DATOS_NEGOCIO })
  estado: EstadoHabilitacion;

  @Column({ name: 'razon_social', nullable: true })
  razonSocial?: string;

  @Column({ nullable: true })
  direccion?: string;

  @Column({ nullable: true })
  ciudad?: string;

  @Column({ name: 'use_alegra_certificate', default: true })
  useAlegraCertificate: boolean;

  @Column({ name: 'certificado_pfx_cifrado', nullable: true })
  certificadoPfxCifrado?: string;

  @Column({ name: 'certificado_password_cifrado', nullable: true })
  certificadoPasswordCifrado?: string;

  @Column({ name: 'resolucion_numero', nullable: true })
  resolucionNumero?: string;

  @Column({ name: 'resolucion_prefijo', nullable: true })
  resolucionPrefijo?: string;

  @Column({ name: 'resolucion_fecha_inicio', type: 'date', nullable: true })
  resolucionFechaInicio?: string;

  @Column({ name: 'resolucion_fecha_fin', type: 'date', nullable: true })
  resolucionFechaFin?: string;

  @Column({ name: 'resolucion_rango_desde', nullable: true })
  resolucionRangoDesde?: number;

  @Column({ name: 'resolucion_rango_hasta', nullable: true })
  resolucionRangoHasta?: number;

  @Column({ name: 'resolucion_technical_key', nullable: true })
  resolucionTechnicalKey?: string;

  /**
   * Siguiente número correlativo a usar dentro del rango de la resolución —
   * no confundir con `documento.intentos` (contador de reintentos de red).
   * DIAN exige numeración correlativa real dentro de resolucionRangoDesde/Hasta.
   */
  @Column({ name: 'siguiente_numero', nullable: true })
  siguienteNumero?: number;

  @Column({ name: 'alegra_company_id', nullable: true })
  alegraCompanyId?: string;

  @Column({ name: 'alegra_government_test_set_id', nullable: true })
  alegraGovernmentTestSetId?: string;

  @Column({ default: 'SANDBOX' })
  ambiente: 'SANDBOX' | 'PRODUCCION';

  @Column({ name: 'error_mensaje', nullable: true })
  errorMensaje?: string;
}
