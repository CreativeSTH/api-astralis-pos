import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipoCondicionAlerta } from '../../common/enums/condicion-alerta.enum';
import { SeveridadAlerta } from '../../common/enums/alerta.enum';
import { Auditable } from '../../auditoria/auditable.decorator';
import { ModuloPermiso } from '../../common/enums/modulo-permiso.enum';

/**
 * Regla configurable: "lanzar [severidad] cuando [tipoCondicion] con
 * parámetro [parametros.valor]". Evaluada en cada corrida de
 * `AlertasService.generar()` (cron cada 30 min + botón "Actualizar").
 */
@Auditable<ReglaAlerta>({
  modulo: ModuloPermiso.ALERTAS,
  nombre: 'la regla de alerta',
  etiqueta: (r) => r.nombre,
  campos: {
    nombre: { label: 'Nombre' },
    tipoCondicion: { label: 'Condición', formato: 'enum' },
    parametros: { label: 'Parámetros' },
    severidad: { label: 'Severidad', formato: 'enum' },
    activa: { label: 'Activa', formato: 'booleano' },
  },
})
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
