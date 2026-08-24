import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { PaginaLayoutGraficos } from '../../common/enums/pagina-layout-graficos.enum';

export interface WidgetLayoutGrafico {
  id: string;
  graficoId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Un renglón por negocio+página — layout compartido a nivel de negocio (no
 * por usuario), gateado por `GRAFICOS:EDITAR`, mismo criterio que el resto
 * de lo que vive en Configuración (artefacto administrado, no personal).
 */
@Entity('layouts_graficos')
@Unique(['negocioId', 'pagina'])
export class LayoutGraficos extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ type: 'enum', enum: PaginaLayoutGraficos })
  pagina: PaginaLayoutGraficos;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  widgets: WidgetLayoutGrafico[];
}
