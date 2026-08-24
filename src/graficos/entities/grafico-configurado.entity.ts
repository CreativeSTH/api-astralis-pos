import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { TipoGrafico } from '../../common/enums/tipo-grafico.enum';
import { FuenteDatoGrafico } from '../../common/enums/fuente-dato-grafico.enum';

export interface SerieGrafico {
  fuenteDato: FuenteDatoGrafico;
  etiqueta: string;
  sucursalId?: string;
  color?: string;
}

export interface RangoFechaGrafico {
  modo: 'FIJO' | 'RELATIVO';
  /** ISO date, solo si modo=FIJO. */
  desde?: string;
  /** ISO date, solo si modo=FIJO. */
  hasta?: string;
  /** Solo si modo=RELATIVO — ventana móvil terminando hoy. */
  diasRelativos?: number;
}

export interface CompararGrafico {
  activo: boolean;
  tipo: 'PERIODO_ANTERIOR' | 'MISMO_PERIODO_ANIO_ANTERIOR';
}

export interface OpcionesGrafico {
  mostrarLeyenda?: boolean;
  apilado?: boolean;
}

export interface ConfiguracionGrafico {
  series: SerieGrafico[];
  rangoFecha: RangoFechaGrafico;
  agrupacion: 'DIA' | 'SEMANA' | 'MES';
  comparar?: CompararGrafico;
  opciones?: OpcionesGrafico;
}

@Entity('graficos_configurados')
export class GraficoConfigurado extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column()
  nombre: string;

  @Column({ type: 'enum', enum: TipoGrafico })
  tipo: TipoGrafico;

  @Column({ type: 'jsonb' })
  configuracion: ConfiguracionGrafico;

  @Column({ default: true })
  activo: boolean;

  @Column({ name: 'creado_por', nullable: true })
  creadoPor?: string;
}
