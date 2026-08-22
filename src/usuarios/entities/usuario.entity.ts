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
}
