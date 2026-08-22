import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipoAlerta, SeveridadAlerta } from '../../common/enums/alerta.enum';

@Entity('alertas')
export class Alerta extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ type: 'enum', enum: TipoAlerta })
  tipo: TipoAlerta;

  @Column({ type: 'enum', enum: SeveridadAlerta })
  severidad: SeveridadAlerta;

  @Column({ name: 'referencia_id', nullable: true })
  referenciaId?: string;

  @Column()
  mensaje: string;

  @Column({ default: false })
  leida: boolean;

  @Column({ default: false })
  resuelta: boolean;
}
