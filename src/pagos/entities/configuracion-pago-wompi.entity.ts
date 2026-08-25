import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('configuraciones_pago_wompi')
export class ConfiguracionPagoWompi {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  negocioId: string;

  @Column({ nullable: true })
  llavePublica: string;

  @Column({ nullable: true })
  llavePrivadaCifrada: string;

  @Column({ nullable: true })
  llaveSecretaEventosCifrada: string;

  @Column({ default: false })
  activo: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
