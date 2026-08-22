import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Cliente } from './cliente.entity';

/** Direcciones guardadas de un cliente — un cliente puede tener varias (casa, trabajo, etc.). */
@Entity('direcciones_cliente')
export class DireccionCliente extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Index()
  @Column({ name: 'cliente_id' })
  clienteId: string;

  @ManyToOne(() => Cliente, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Cliente;

  /** Ej. "Casa", "Trabajo" — para distinguir varias direcciones del mismo cliente. */
  @Column({ nullable: true })
  etiqueta?: string;

  @Column({ name: 'direccion_linea1' })
  direccionLinea1: string;

  /** Apto/interior/torre/oficina. */
  @Column({ name: 'direccion_linea2', nullable: true })
  direccionLinea2?: string;

  @Column({ nullable: true })
  barrio?: string;

  @Column({ name: 'punto_referencia', nullable: true })
  puntoReferencia?: string;

  /** Puede diferir del teléfono del cliente (ej. entrega en casa de otra persona). */
  @Column({ name: 'telefono_contacto', nullable: true })
  telefonoContacto?: string;

  @Column({ default: false })
  predeterminada: boolean;

  @Column({ default: true })
  activo: boolean;
}
