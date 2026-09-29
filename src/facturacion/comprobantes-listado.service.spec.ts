import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ComprobantesListadoService } from './comprobantes-listado.service';

describe('ComprobantesListadoService', () => {
  let service: ComprobantesListadoService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ComprobantesListadoService,
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();
    service = moduleRef.get(ComprobantesListadoService);
  });

  it('pagina, cuenta y resume con los mismos filtros (el resumen sin tipo/estado)', async () => {
    const fecha = new Date('2026-09-29T15:00:00Z');
    query
      .mockResolvedValueOnce([
        {
          tipo: 'RECIBO_CAJA',
          numero: 'RC-1',
          fecha,
          cliente: 'Ana',
          total: '4000.00',
          estado_dian: null,
          ambiente: null,
          estado_venta: 'ACTIVA',
          venta_id: 'v1',
          documento_id: null,
          abono_id: 'a1',
        },
      ])
      .mockResolvedValueOnce([{ total: 21 }])
      .mockResolvedValueOnce([
        { tipo: 'RECIBO_CAJA', estado_dian: null, cantidad: 2 },
      ]);

    const r = await service.listar('neg-1', {
      tipo: 'RECIBO_CAJA',
      q: 'ana',
      pagina: 2,
      porPagina: 10,
    });

    const [sqlItems, paramsItems] = query.mock.calls[0];
    expect(sqlItems).toContain('ORDER BY c.fecha DESC');
    expect(sqlItems).toContain('LIMIT $4 OFFSET $5');
    expect(paramsItems).toEqual(['neg-1', 'RECIBO_CAJA', '%ana%', 10, 10]);
    expect(query.mock.calls[1][1]).toEqual(['neg-1', 'RECIBO_CAJA', '%ana%']);
    expect(query.mock.calls[2][0]).toContain('GROUP BY c.tipo, c.estado_dian');
    expect(query.mock.calls[2][1]).toEqual(['neg-1', '%ana%']);
    expect(r).toMatchObject({
      total: 21,
      pagina: 2,
      porPagina: 10,
      items: [
        { tipo: 'RECIBO_CAJA', numero: 'RC-1', total: 4000, abonoId: 'a1' },
      ],
      resumen: { porTipo: { RECIBO_CAJA: 2 } },
    });
  });

  it('valores por defecto: página 1 de 20', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);
    const r = await service.listar('neg-1', {});
    expect(query.mock.calls[0][1]).toEqual(['neg-1', 20, 0]);
    expect(r).toMatchObject({ pagina: 1, porPagina: 20, total: 0, items: [] });
  });
});
