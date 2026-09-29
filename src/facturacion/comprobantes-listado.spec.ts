import {
  construirFiltros,
  mapearFila,
  resumirConteos,
  SQL_COMPROBANTES,
} from './comprobantes-listado';
import {
  inicioDiaColombia,
  finDiaColombia,
} from '../common/utils/fecha-colombia';

describe('comprobantes-listado', () => {
  it('SQL base: ventas con su último documento (LATERAL) + abonos numerados, filtrados por negocio ($1)', () => {
    expect(SQL_COMPROBANTES).toContain('LEFT JOIN LATERAL');
    expect(SQL_COMPROBANTES).toContain('UNION ALL');
    expect(SQL_COMPROBANTES).toContain('r.numero_recibo IS NOT NULL');
    expect(SQL_COMPROBANTES.match(/negocio_id = \$1/g)).toHaveLength(2);
  });

  it('sin filtros → sin WHERE', () => {
    expect(construirFiltros({})).toEqual({ where: '', params: [] });
  });

  it('todos los filtros, numerados desde $2 (el $1 es el negocio)', () => {
    const r = construirFiltros({
      tipo: 'RECIBO_CAJA',
      estadoDian: 'RECHAZADO' as never,
      desde: '2026-09-01',
      hasta: '2026-09-30',
      q: ' RC-1 ',
    });
    expect(r.where).toBe(
      'WHERE c.tipo = $2 AND c.estado_dian = $3 AND c.fecha >= $4 AND c.fecha <= $5 AND (c.numero ILIKE $6 OR c.cliente ILIKE $6)',
    );
    expect(r.params).toEqual([
      'RECIBO_CAJA',
      'RECHAZADO',
      inicioDiaColombia('2026-09-01'),
      finDiaColombia('2026-09-30'),
      '%RC-1%',
    ]);
  });

  it('para el resumen se omiten tipo y estado', () => {
    const r = construirFiltros(
      { tipo: 'RECIBO', estadoDian: 'ACEPTADO' as never, q: 'ana' },
      { incluirTipoYEstado: false },
    );
    expect(r).toEqual({
      where: 'WHERE (c.numero ILIKE $2 OR c.cliente ILIKE $2)',
      params: ['%ana%'],
    });
  });

  it('búsqueda en blanco no filtra', () => {
    expect(construirFiltros({ q: '   ' }).where).toBe('');
  });

  it('mapea la fila cruda a camelCase con números', () => {
    const fecha = new Date('2026-09-29T15:00:00Z');
    expect(
      mapearFila({
        tipo: 'FACTURA_ELECTRONICA',
        numero: 'FE17',
        fecha,
        cliente: 'Ana',
        total: '32130.00',
        estado_dian: 'ACEPTADO',
        ambiente: 'PRODUCCION',
        estado_venta: 'COMPLETADA',
        venta_id: 'v1',
        documento_id: 'd1',
        abono_id: null,
      }),
    ).toEqual({
      tipo: 'FACTURA_ELECTRONICA',
      numero: 'FE17',
      fecha,
      cliente: 'Ana',
      total: 32130,
      estadoDian: 'ACEPTADO',
      ambiente: 'PRODUCCION',
      estadoVenta: 'COMPLETADA',
      ventaId: 'v1',
      documentoId: 'd1',
      abonoId: null,
    });
  });

  it('resume por tipo y agrupa los estados DIAN', () => {
    expect(
      resumirConteos([
        { tipo: 'FACTURA_ELECTRONICA', estado_dian: 'ACEPTADO', cantidad: 3 },
        {
          tipo: 'FACTURA_ELECTRONICA',
          estado_dian: 'ACEPTADO_CON_OBSERVACIONES',
          cantidad: 1,
        },
        { tipo: 'FACTURA_ELECTRONICA', estado_dian: 'ERROR', cantidad: 1 },
        { tipo: 'FACTURA_ELECTRONICA', estado_dian: 'PENDIENTE', cantidad: 2 },
        { tipo: 'FACTURA_ELECTRONICA', estado_dian: 'RECHAZADO', cantidad: 1 },
        { tipo: 'RECIBO', estado_dian: null, cantidad: 5 },
        { tipo: 'RECIBO_CAJA', estado_dian: null, cantidad: 2 },
      ]),
    ).toEqual({
      porTipo: {
        FACTURA_ELECTRONICA: 8,
        RECIBO: 5,
        FACTURA: 0,
        RECIBO_CAJA: 2,
      },
      dian: { aceptados: 4, pendientes: 3, rechazados: 1 },
    });
  });
});
