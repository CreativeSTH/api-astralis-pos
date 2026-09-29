import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { GraficoConfigurado, ConfiguracionGrafico } from './entities/grafico-configurado.entity';
import { LayoutGraficos } from './entities/layout-graficos.entity';
import { PaginaLayoutGraficos } from '../common/enums/pagina-layout-graficos.enum';
import { CreateGraficoDto } from './dto/create-grafico.dto';
import { UpdateGraficoDto } from './dto/update-grafico.dto';
import { ConfiguracionGraficoDto } from './dto/configuracion-grafico.dto';
import { UpsertLayoutDto } from './dto/upsert-layout.dto';
import { GraficosDataService, DatoGrafico, FiltroFuenteDato } from './graficos-data.service';
import { rangoDiasColombia } from '../common/utils/fecha-colombia';

export interface SerieResultado {
  etiqueta: string;
  datos: DatoGrafico[];
}

@Injectable()
export class GraficosService extends TenantBaseService<GraficoConfigurado> {
  constructor(
    @InjectRepository(GraficoConfigurado)
    repository: Repository<GraficoConfigurado>,
    @InjectRepository(LayoutGraficos)
    private readonly layoutRepository: Repository<LayoutGraficos>,
    private readonly dataService: GraficosDataService,
    cls: ClsService,
  ) {
    super(repository, cls, 'Gráfico');
  }

  fuentes() {
    return this.dataService.catalogo();
  }

  findAll() {
    return this.findAllForTenant({ activo: true });
  }

  findOne(id: string) {
    return this.findOneForTenant(id);
  }

  create(dto: CreateGraficoDto) {
    const creadoPor = this.cls.get<string>('usuarioId');
    return this.createForTenant({ ...dto, creadoPor });
  }

  update(id: string, dto: UpdateGraficoDto) {
    return this.updateForTenant(id, dto);
  }

  async remove(id: string) {
    await this.updateForTenant(id, { activo: false });
  }

  async preview(dto: ConfiguracionGraficoDto): Promise<SerieResultado[]> {
    return this.calcularSeries(dto);
  }

  async datos(id: string, overrideDesde?: string, overrideHasta?: string): Promise<SerieResultado[]> {
    const grafico = await this.findOneForTenant(id);
    const configuracion: ConfiguracionGrafico = { ...grafico.configuracion };
    if (overrideDesde || overrideHasta) {
      configuracion.rangoFecha = {
        modo: 'FIJO',
        desde: overrideDesde ?? configuracion.rangoFecha.desde,
        hasta: overrideHasta ?? configuracion.rangoFecha.hasta,
      };
    }
    return this.calcularSeries(configuracion);
  }

  /** Mismo criterio que `ReportesService.rangoFechas()` — días calendario de Colombia (ver fecha-colombia.ts). */
  private resolverRango(rangoFecha: ConfiguracionGrafico['rangoFecha']): { desde: Date; hasta: Date } {
    if (rangoFecha.modo === 'RELATIVO') return rangoDiasColombia(undefined, rangoFecha.hasta, rangoFecha.diasRelativos ?? 30);
    return rangoDiasColombia(rangoFecha.desde, rangoFecha.hasta, 30);
  }

  private async calcularSeries(configuracion: ConfiguracionGrafico): Promise<SerieResultado[]> {
    const { desde, hasta } = this.resolverRango(configuracion.rangoFecha);
    const resultados: SerieResultado[] = [];
    for (const serie of configuracion.series) {
      const filtro: FiltroFuenteDato = {
        desde,
        hasta,
        sucursalId: serie.sucursalId,
        agrupacion: configuracion.agrupacion,
      };
      const datos = await this.dataService.obtenerDatos(serie.fuenteDato, filtro);
      resultados.push({ etiqueta: serie.etiqueta, datos });
    }
    return resultados;
  }

  // --- Layout de Dashboard/Reportes ---

  async obtenerLayout(pagina: PaginaLayoutGraficos): Promise<LayoutGraficos> {
    const negocioId = this.getNegocioId();
    const existente = await this.layoutRepository.findOne({ where: { negocioId, pagina } });
    if (existente) return existente;
    return this.layoutRepository.create({ negocioId, pagina, widgets: [] });
  }

  async guardarLayout(pagina: PaginaLayoutGraficos, dto: UpsertLayoutDto): Promise<LayoutGraficos> {
    const negocioId = this.getNegocioId();
    let layout = await this.layoutRepository.findOne({ where: { negocioId, pagina } });
    if (!layout) {
      layout = this.layoutRepository.create({ negocioId, pagina });
    }
    layout.widgets = dto.widgets;
    return this.layoutRepository.save(layout);
  }
}
