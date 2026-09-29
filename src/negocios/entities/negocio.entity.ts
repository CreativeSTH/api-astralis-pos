import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { OrigenObligacion, ResponsabilidadIva, TipoPersona } from './perfil-fiscal.enum';

export enum PlanNegocio {
  FREE = 'FREE',
  BASICO = 'BASICO',
  PRO = 'PRO',
}

@Entity('negocios')
export class Negocio extends BaseEntity {
  @Column()
  nombre: string;

  @Column({ nullable: true })
  nit?: string;

  @Column({ name: 'tipo_negocio', nullable: true })
  tipoNegocio?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  telefono?: string;

  @Column({ nullable: true })
  direccion?: string;

  @Column({ name: 'ciudad_nombre', nullable: true })
  ciudadNombre?: string;

  @Column({ name: 'ciudad_codigo', nullable: true })
  ciudadCodigo?: string;

  @Column({ name: 'departamento_codigo', nullable: true })
  departamentoCodigo?: string;

  /** Logo oficial del negocio (ruta relativa `/uploads/negocios/logos/...`) — lo usa el PDF de factura electrónica. */
  @Column({ name: 'logo_url', type: 'varchar', nullable: true })
  logoUrl?: string | null;

  /** Formato de impresión del negocio (fase 5b): se imprime al pie de recibos y facturas. El logo es `logoUrl`. */
  @Column({ name: 'mensaje_cierre_comprobante', type: 'varchar', nullable: true })
  mensajeCierreComprobante?: string | null;

  @Column({ name: 'terminos_comprobante', type: 'text', nullable: true })
  terminosComprobante?: string | null;

  /** Perfil fiscal declarado por el administrador (ver PoliticaFacturacionService). null = sin declarar. */
  @Column({ name: 'tipo_persona', type: 'enum', enum: TipoPersona, nullable: true })
  tipoPersona?: TipoPersona | null;

  @Column({ name: 'responsabilidad_iva', type: 'enum', enum: ResponsabilidadIva, nullable: true })
  responsabilidadIva?: ResponsabilidadIva | null;

  @Column({ name: 'perfil_fiscal_declarado_en', type: 'timestamptz', nullable: true })
  perfilFiscalDeclaradoEn?: Date | null;

  @Column({ name: 'perfil_fiscal_declarado_por', type: 'varchar', nullable: true })
  perfilFiscalDeclaradoPor?: string | null;

  /** Inicio de la obligación de facturar electrónicamente conocida por AURA — arranca los 40 días de gracia. */
  @Column({ name: 'obligado_desde', type: 'timestamptz', nullable: true })
  obligadoDesde?: Date | null;

  @Column({ name: 'origen_obligacion', type: 'enum', enum: OrigenObligacion, nullable: true })
  origenObligacion?: OrigenObligacion | null;

  /** Último aviso del tope de 3.500 UVT enviado (70/90/100) en el año `avisoTopeUvtAnio` — evita repetirlo cada noche. */
  @Column({ name: 'aviso_tope_uvt_nivel', type: 'smallint', nullable: true })
  avisoTopeUvtNivel?: number | null;

  @Column({ name: 'aviso_tope_uvt_anio', type: 'smallint', nullable: true })
  avisoTopeUvtAnio?: number | null;

  @Column({ type: 'enum', enum: PlanNegocio, default: PlanNegocio.FREE })
  plan: PlanNegocio;

  @Column({ default: true })
  activo: boolean;
}
