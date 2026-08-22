import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('proveedores')
export class Proveedor extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  nit?: string;

  @Column({ name: 'contacto_nombre', nullable: true })
  contactoNombre?: string;

  @Column({ nullable: true })
  telefono?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  direccion?: string;

  @Column({ name: 'rut_numero', nullable: true })
  rutNumero?: string;

  @Column({ name: 'rut_documento_url', nullable: true })
  rutDocumentoUrl?: string;

  @Column({ name: 'camara_comercio_numero', nullable: true })
  camaraComercioNumero?: string;

  @Column({ name: 'camara_comercio_url', nullable: true })
  camaraComercioUrl?: string;

  @Column({ name: 'certificacion_bancaria_info', nullable: true })
  certificacionBancariaInfo?: string;

  @Column({ name: 'certificacion_bancaria_url', nullable: true })
  certificacionBancariaUrl?: string;

  @Column({ default: true })
  activo: boolean;
}
