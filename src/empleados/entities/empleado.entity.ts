import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Auditable } from '../../auditoria/auditable.decorator';
import { ModuloPermiso } from '../../common/enums/modulo-permiso.enum';
import { TipoDocumentoEmpleado } from '../enums';

/** Persona que trabaja en el negocio, use o no AURA (spec 2026-10-04 §3). El PIN de marcación nunca se audita ni se devuelve. */
@Auditable<Empleado>({
  modulo: ModuloPermiso.EMPLEADOS,
  nombre: 'el empleado',
  etiqueta: (e) => e.nombre,
  campos: {
    nombre: { label: 'Nombre' },
    numeroDocumento: { label: 'Documento' },
    cargo: { label: 'Cargo' },
    sucursalId: { label: 'Sucursal habitual', formato: 'relacion', entidad: () => Sucursal },
    usuarioId: { label: 'Usuario de AURA', formato: 'relacion', entidad: () => Usuario },
    salarioMensual: { label: 'Salario mensual', formato: 'moneda' },
    aplicaHorasExtra: { label: 'Genera horas extra', formato: 'booleano' },
    activo: { label: 'Activo', formato: 'booleano' },
  },
})
@Entity('empleados')
@Index('UQ_empleados_negocio_documento', ['negocioId', 'numeroDocumento'], { unique: true })
export class Empleado extends BaseEntity {
  @Index('IDX_empleados_negocio')
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column()
  nombre: string;

  @Column({ name: 'tipo_documento', type: 'enum', enum: TipoDocumentoEmpleado, default: TipoDocumentoEmpleado.CC })
  tipoDocumento: TipoDocumentoEmpleado;

  @Column({ name: 'numero_documento' })
  numeroDocumento: string;

  @Column({ type: 'varchar', nullable: true })
  cargo: string | null;

  @Column({ name: 'sucursal_id', type: 'uuid', nullable: true })
  sucursalId: string | null;

  @ManyToOne(() => Sucursal, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sucursal_id' })
  sucursal?: Sucursal;

  @Index('UQ_empleados_usuario', { unique: true, where: '"usuario_id" IS NOT NULL' })
  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Usuario;

  @Column({ name: 'salario_mensual', type: 'numeric', precision: 12, scale: 2 })
  salarioMensual: number;

  /** false para dirección, confianza y manejo (CST art. 162): solo recargos, nunca horas extra. */
  @Column({ name: 'aplica_horas_extra', default: true })
  aplicaHorasExtra: boolean;

  @Column({ name: 'pin_marcacion_hash', select: false })
  pinMarcacionHash: string;

  @Column({ default: true })
  activo: boolean;
}
