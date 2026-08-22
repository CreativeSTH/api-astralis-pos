import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Cliente } from './cliente.entity';
import { TipoNotaCliente } from '../../common/enums/cliente.enum';

@Entity('notas_cliente')
export class NotaCliente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'cliente_id' })
  clienteId: string;

  @ManyToOne(() => Cliente, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cliente_id' })
  cliente: Cliente;

  @Column({ type: 'enum', enum: TipoNotaCliente })
  tipo: TipoNotaCliente;

  @Column()
  contenido: string;

  @Column({ name: 'creada_por', nullable: true })
  creadaPor?: string;

  @CreateDateColumn({ name: 'fecha' })
  fecha: Date;
}
