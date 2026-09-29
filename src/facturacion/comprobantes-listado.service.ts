import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FiltrosComprobantesDto } from './dto/filtros-comprobantes.dto';
import {
  construirFiltros,
  FilaCruda,
  ListadoComprobantes,
  mapearFila,
  resumirConteos,
  SQL_COMPROBANTES,
  TipoComprobanteListado,
} from './comprobantes-listado';

/** Listado único de comprobantes del negocio para la página Facturación (spec 6.3). */
@Injectable()
export class ComprobantesListadoService {
  constructor(private readonly dataSource: DataSource) {}

  async listar(
    negocioId: string,
    filtros: FiltrosComprobantesDto,
  ): Promise<ListadoComprobantes> {
    const pagina = filtros.pagina ?? 1;
    const porPagina = filtros.porPagina ?? 20;

    const { where, params } = construirFiltros(filtros);
    const origen = `FROM (${SQL_COMPROBANTES}) c ${where}`;
    const n = params.length + 2;
    const filas: FilaCruda[] = await this.dataSource.query(
      `SELECT c.* ${origen} ORDER BY c.fecha DESC, c.numero DESC LIMIT $${n} OFFSET $${n + 1}`,
      [negocioId, ...params, porPagina, (pagina - 1) * porPagina],
    );
    const [{ total }]: { total: number }[] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total ${origen}`,
      [negocioId, ...params],
    );

    // El resumen es lo que se usa para elegir el filtro de tipo/estado, así que no lo aplica.
    const r = construirFiltros(filtros, { incluirTipoYEstado: false });
    const conteos: {
      tipo: TipoComprobanteListado;
      estado_dian: string | null;
      cantidad: number;
    }[] = await this.dataSource.query(
      `SELECT c.tipo, c.estado_dian, COUNT(*)::int AS cantidad FROM (${SQL_COMPROBANTES}) c ${r.where} GROUP BY c.tipo, c.estado_dian`,
      [negocioId, ...r.params],
    );

    return {
      items: filas.map(mapearFila),
      total,
      pagina,
      porPagina,
      resumen: resumirConteos(conteos),
    };
  }
}
