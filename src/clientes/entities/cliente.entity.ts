import { Column, Entity, Index } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { Auditable } from '../../auditoria/auditable.decorator';
import { ModuloPermiso } from '../../common/enums/modulo-permiso.enum';

@Auditable<Cliente>({
  modulo: ModuloPermiso.CLIENTES,
  nombre: 'el cliente',
  etiqueta: (c) => c.nombre,
  campos: {
    nombre: { label: 'Nombre' },
    telefono: { label: 'Teléfono' },
    email: { label: 'Correo' },
    direccion: { label: 'Dirección' },
    documentoIdentidad: { label: 'Documento' },
    tipoDocumentoIdentidad: { label: 'Tipo de documento' },
    limiteCredito: { label: 'Cupo de crédito', formato: 'moneda' },
    activo: { label: 'Activo', formato: 'booleano' },
  },
  secretos: { passwordHash: 'Contraseña de la tienda online' },
})
@Entity('clientes')
@Index(['negocioId', 'telefono'], { unique: true })
export class Cliente extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column()
  nombre: string;

  @Column()
  telefono: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  direccion?: string;

  @Column({ name: 'documento_identidad', nullable: true })
  documentoIdentidad?: string;

  /** Catálogo DIAN de tipo de identificación (13 CC, 31 NIT, 22 CE, 41 Pasaporte...) — necesario para el `customer` de Factura Electrónica. */
  @Column({ name: 'tipo_documento_identidad', nullable: true })
  tipoDocumentoIdentidad?: string;

  @Column({
    name: 'limite_credito',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  limiteCredito: number;

  @Column({
    name: 'deuda_actual',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  deudaActual: number;

  /** Crédito en tienda por devoluciones; se usa como medio de pago "Saldo a favor". */
  @Column({
    name: 'saldo_a_favor',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  saldoAFavor: number;

  @Column({ default: 100 })
  score: number;

  @Column({ name: 'bloqueado_por_mora', default: false })
  bloqueadoPorMora: boolean;

  @Column({ name: 'fecha_bloqueo', type: 'timestamptz', nullable: true })
  fechaBloqueo?: Date;

  @Column({ name: 'motivo_bloqueo', nullable: true })
  motivoBloqueo?: string;

  @Column({ default: true })
  activo: boolean;

  /** Nunca debe viajar en una respuesta HTTP del backoffice — ver ClientesController (ClassSerializerInterceptor). */
  @Exclude()
  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string | null;
}
