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

  /** Nombre del municipio, solo para mostrar en la UI — la llamada real a Alegra usa `ciudadCodigo`. */
  @Column({ nullable: true })
  ciudad?: string;

  /** Código DIVIPOLA del municipio (5 dígitos) — Alegra valida `address.city` contra un enum estricto, no nombres libres. */
  @Column({ name: 'ciudad_codigo', nullable: true })
  ciudadCodigo?: string;

  /** Código DIVIPOLA del departamento (2 dígitos) — se deriva del municipio elegido, no se pide aparte. */
  @Column({ name: 'departamento_codigo', nullable: true })
  departamentoCodigo?: string;

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

  /**
   * TestSetId emitido por la propia DIAN en su portal de Habilitación (no lo
   * genera Alegra — hay que suministrarlo). Para sandbox existe un id público
   * documentado que no depende de trámite real; confirmado en vivo 2026-09-01
   * contra el sandbox real de Alegra.
   */
  @Column({ name: 'government_test_set_id', nullable: true })
  governmentTestSetId?: string;

  @Column({ default: 'SANDBOX' })
  ambiente: 'SANDBOX' | 'PRODUCCION';

  /**
   * true solo mientras esta habilitación viene del atajo de "Probar sin trámite" — hace que
   * confirmarTestSet() nunca la pase a ambiente PRODUCCION sola. Se vuelve false al activar
   * facturación real (ver FacturacionElectronicaService.volverAModoReal).
   */
  @Column({ name: 'es_habilitacion_de_prueba', default: false })
  esHabilitacionDePrueba: boolean;

  @Column({ name: 'error_mensaje', nullable: true })
  errorMensaje?: string;
}
