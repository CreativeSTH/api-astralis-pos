import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipoCondicionAlerta } from '../../common/enums/condicion-alerta.enum';
import { SeveridadAlerta } from '../../common/enums/alerta.enum';

/**
 * Regla configurable: "lanzar [severidad] cuando [tipoCondicion] con
 * parámetro [parametros.valor]". Evaluada en cada corrida de
 * `AlertasService.generar()` (cron cada 30 min + botón "Actualizar").
 */
@Entity('reglas_alerta')
export class ReglaAlerta extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column()
  nombre: string;

  @Column({ name: 'tipo_condicion', type: 'enum', enum: TipoCondicionAlerta })
  tipoCondicion: TipoCondicionAlerta;

  /** Forma `{ valor: number }` — la unidad (horas/días) depende de `tipoCondicion`. */
  @Column({ type: 'jsonb' })
  parametros: Record<string, unknown>;

  @Column({ type: 'enum', enum: SeveridadAlerta })
  severidad: SeveridadAlerta;

  @Column({ default: true })
  activa: boolean;
}
