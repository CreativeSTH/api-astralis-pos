import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { ReportesService } from './reportes.service';
import { Venta } from '../ventas/entities/venta.entity';
import { VentaPago } from '../ventas/entities/venta-pago.entity';
import { TurnoCaja } from '../caja/entities/turno-caja.entity';
import { Devolucion } from '../devoluciones/entities/devolucion.entity';

/** QueryBuilder encadenable: cada consulta nueva toma el siguiente resultado de `respuestas`. */
function qbFalso(respuestas: { raw?: unknown; rawMany?: unknown[]; many?: unknown[] }) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['where', 'andWhere', 'select', 'addSelect', 'groupBy', 'orderBy', 'limit', 'innerJoin', 'leftJoinAndSelect', 'innerJoinAndSelect']) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getRawOne = jest.fn().mockResolvedValue(respuestas.raw);
  qb.getRawMany = jest.fn().mockResolvedValue(respuestas.rawMany ?? []);
  qb.getMany = jest.fn().mockResolvedValue(respuestas.many ?? []);
  return qb;
}

describe('ReportesService — devoluciones', () => {
  let service: ReportesService;
  let devoluciones: { createQueryBuilder: jest.Mock };
  let ventas: { createQueryBuilder: jest.Mock };
  let pagos: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    devoluciones = { createQueryBuilder: jest.fn() };
    ventas = { createQueryBuilder: jest.fn() };
    pagos = { createQueryBuilder: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportesService,
        { provide: getRepositoryToken(Venta), useValue: ventas },
        { provide: getRepositoryToken(VentaPago), useValue: pagos },
        { provide: getRepositoryToken(TurnoCaja), useValue: {} },
        { provide: getRepositoryToken(Devolucion), useValue: devoluciones },
        { provide: ClsService, useValue: { get: () => 'neg-1' } },
      ],
    }).compile();
    service = moduleRef.get(ReportesService);
  });

  it('ventas: suma las devoluciones del período e informa los ingresos netos', async () => {
    ventas.createQueryBuilder.mockReturnValue(
      qbFalso({ many: [{ total: '100000', descuentoTotal: '0', tipoVenta: 'CONTADO', createdAt: new Date('2026-10-02T15:00:00Z') }] }),
    );
    pagos.createQueryBuilder.mockReturnValue(qbFalso({ many: [] }));
    devoluciones.createQueryBuilder.mockReturnValue(qbFalso({ raw: { total: '23800.00' } }));
    const r = await service.ventas({ desde: '2026-10-01', hasta: '2026-10-02' });
    expect(r).toMatchObject({ totalIngresos: 100_000, totalDevoluciones: 23_800, ingresosNetos: 76_200 });
  });

  it('devoluciones: totales, por forma, por motivo y top productos (montos numéricos)', async () => {
    devoluciones.createQueryBuilder
      .mockReturnValueOnce(qbFalso({ raw: { cantidad: '2', total: '35700.00' } }))
      .mockReturnValueOnce(qbFalso({ rawMany: [{ forma: 'EFECTIVO', total: '35700.00' }] }))
      .mockReturnValueOnce(qbFalso({ rawMany: [{ motivo: 'Defectuoso', cantidad: '2', total: '35700.00' }] }))
      .mockReturnValueOnce(qbFalso({ rawMany: [{ nombreProducto: 'Martillo', cantidad: '3.00', total: '35700.00' }] }));
    const r = await service.devoluciones({ desde: '2026-10-01', hasta: '2026-10-02' });
    expect(r).toMatchObject({
      cantidad: 2,
      total: 35_700,
      porForma: [{ forma: 'EFECTIVO', total: 35_700 }],
      porMotivo: [{ motivo: 'Defectuoso', cantidad: 2, total: 35_700 }],
      topProductos: [{ nombreProducto: 'Martillo', cantidad: 3, total: 35_700 }],
    });
  });

  it('devoluciones sin datos: ceros', async () => {
    devoluciones.createQueryBuilder.mockReturnValue(qbFalso({ raw: undefined, rawMany: [] }));
    const r = await service.devoluciones({});
    expect(r).toMatchObject({ cantidad: 0, total: 0, porForma: [], porMotivo: [], topProductos: [] });
  });
});
