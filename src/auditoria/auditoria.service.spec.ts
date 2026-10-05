import { AuditoriaService } from './auditoria.service';

/** QueryBuilder falso que registra cada llamada encadenada. */
function qbFalso(resultado: [unknown[], number]) {
  const llamadas: { metodo: string; args: unknown[] }[] = [];
  const qb: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, metodo: string) =>
        metodo === 'getManyAndCount'
          ? () => Promise.resolve(resultado)
          : (...args: unknown[]) => {
              llamadas.push({ metodo, args });
              return qb;
            },
    },
  );
  return { qb, llamadas };
}

describe('AuditoriaService.consultar', () => {
  const crear = (negocioId: string | undefined) => {
    const { qb, llamadas } = qbFalso([[{ id: 'r1' }], 1]);
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    const cls = {
      isActive: () => true,
      get: (k: string) => (k === 'negocioId' ? negocioId : undefined),
    };
    return {
      servicio: new AuditoriaService(repo as any, {} as any, cls as any),
      llamadas,
    };
  };
  const filtraDesde = (llamadas: { metodo: string; args: unknown[] }[]) =>
    llamadas.some(
      (l) =>
        l.metodo === 'andWhere' && String(l.args[0]).includes('r.createdAt >='),
    );

  it('filtra siempre por el negocio del contexto y pagina', async () => {
    const { servicio, llamadas } = crear('n1');
    const r = await servicio.consultar({ pagina: 2, porPagina: 10 });
    expect(llamadas[0]).toEqual({
      metodo: 'where',
      args: ['r.negocioId = :negocioId', { negocioId: 'n1' }],
    });
    expect(llamadas).toContainEqual({ metodo: 'skip', args: [10] });
    expect(llamadas).toContainEqual({ metodo: 'take', args: [10] });
    expect(r).toEqual({
      items: [{ id: 'r1' }],
      total: 1,
      pagina: 2,
      porPagina: 10,
    });
  });

  it('sin fechas aplica los últimos 7 días', async () => {
    const { servicio, llamadas } = crear('n1');
    await servicio.consultar({});
    expect(filtraDesde(llamadas)).toBe(true);
  });

  it('con entidadId no aplica el rango por defecto', async () => {
    const { servicio, llamadas } = crear('n1');
    await servicio.consultar({
      entidad: 'Producto',
      entidadId: '00000000-0000-0000-0000-000000000001',
    });
    expect(filtraDesde(llamadas)).toBe(false);
  });

  it('escapa los comodines de la búsqueda', async () => {
    const { servicio, llamadas } = crear('n1');
    await servicio.consultar({ buscar: '50%_' });
    const busqueda = llamadas.find((l) => String(l.args[0]).includes('ILIKE'));
    expect(busqueda?.args[1]).toEqual({ buscar: '%50\\%\\_%' });
  });

  it('falla si no hay negocio en el contexto', async () => {
    const { servicio } = crear(undefined);
    await expect(servicio.consultar({})).rejects.toThrow();
  });
});
