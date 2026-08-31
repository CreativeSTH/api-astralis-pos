import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Negocio } from '../../negocios/entities/negocio.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { Rol } from '../../roles/entities/rol.entity';

@Entity('usuarios')
export class Usuario extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id', nullable: true })
  negocioId: string | null;

  @ManyToOne(() => Negocio, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'negocio_id' })
  negocio?: Negocio;

  @Column({ name: 'sucursal_id', nullable: true })
  sucursalId: string | null;

  @ManyToOne(() => Sucursal, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sucursal_id' })
  sucursal?: Sucursal;

  @Column()
  nombre: string;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  /** Hash bcrypt de un PIN de 4-6 dígitos — cambio rápido de cajero sin cerrar sesión del turno. */
  @Column({ name: 'pin_hash', nullable: true })
  pinHash?: string;

  @Index()
  @Column({ name: 'rol_id' })
  rolId: string;

  @ManyToOne(() => Rol, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'rol_id' })
  rol?: Rol;

  @Column({ default: true })
  activo: boolean;

  /**
   * default: true — un usuario creado por un rol SISTEMA (o ya existente antes
   * de esta migración) queda verificado de entrada, un humano ya lo dio de
   * alta. Solo el registro público (registroPublico) lo crea explícitamente en false.
   */
  @Column({ name: 'email_verificado', default: true })
  emailVerificado: boolean;

  /**
   * Tipado `| null` (no solo `?: string`) a propósito: TypeORM's `save()`
   * ignora las propiedades en `undefined` (no las incluye en el UPDATE), así
   * que asignar `undefined` para "borrar" el token nunca llega a limpiar la
   * columna — hay que asignar `null` explícito. Ver AuthService.verificarEmail.
   */
  @Column({ name: 'token_verificacion', type: 'varchar', nullable: true })
  tokenVerificacion?: string | null;

  @Column({ name: 'token_verificacion_expira', type: 'timestamptz', nullable: true })
  tokenVerificacionExpira?: Date | null;
}
