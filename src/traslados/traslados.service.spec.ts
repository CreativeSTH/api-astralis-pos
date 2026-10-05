import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { TrasladosService } from './traslados.service';
import { EstadoTraslado } from '../common/enums/estado-traslado.enum';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum';

type Fila = Record<string, any>;

interface OpcionesEntorno {
  /** clave `productoId:bodegaId` → cantidad */
  inventarios?: Record<string, number>;
  traslado?: Fila | null;
  items?: Fila[];
  maxConsecutivo?: number;
  sucursalId?: string | null;
  puedeEnviar?: boolean;
  /** bodegas asociadas a la sucursal del usuario restringido */
  visibles?: string[];
}

const BODEGAS = [
  { id: 'bod-cedi', nombre: 'CEDI', negocioId: 'neg-1', activo: true },
  { id: 'bod-norte', nombre: 'Norte', negocioId: 'neg-1', activo: true },
  { id: 'bod-sur', nombre: 'Sur', negocioId: 'neg-1', activo: true },
];
const PRODUCTOS = [
  { id: 'prod-1', nombre: 'Arena' },
  { id: 'prod-2', nombre: 'Collar' },
];

/** Manager falso en memoria: lo justo para las consultas del servicio, por nombre de entidad. */
function entorno(o: OpcionesEntorno = {}) {
  const inventarios = new Map<string, Fila>();
  for (const [clave, cantidad] of Object.entries(o.inventarios ?? {})) {
    const [productoId, bodegaId] = clave.split(':');
    inventarios.set(clave, { id: `inv-${clave}`, negocioId: 'neg-1', productoId, bodegaId, cantidad, stockMinimo: 0 });
  }
  const movimientos: Fila[] = [];
  let traslado: Fila | null = o.traslado ? { ...o.traslado } : null;
  const items: Fila[] = (o.items ?? []).map((i) => ({ ...i }));
  const ids = (where: Fila) => (where.id?.value ?? [where.id]) as string[];

  const repos: Record<string, Fila> = {
    Bodega: {
      find: jest.fn(async ({ where }) => BODEGAS.filter((b) => ids(where).includes(b.id) && b.activo)),
    },
    Producto: {
      find: jest.fn(async ({ where }) => PRODUCTOS.filter((p) => ids(where).includes(p.id))),
    },
    Negocio: { findOne: jest.fn(async () => ({ id: 'neg-1' })) },
    Inventario: {
      findOne: jest.fn(async ({ where }) => inventarios.get(`${where.productoId}:${where.bodegaId}`) ?? null),
      create: jest.fn((x) => ({ ...x })),
      save: jest.fn(async (x) => {
        inventarios.set(`${x.productoId}:${x.bodegaId}`, x);
        return x;
      }),
    },
    MovimientoInventario: {
      create: jest.fn((x) => ({ ...x })),
      save: jest.fn(async (x) => {
        movimientos.push(...[x].flat());
        return x;
      }),
    },
    Traslado: {
      create: jest.fn((x) => ({ ...x })),
      findOne: jest.fn(async () => traslado),
      save: jest.fn(async (x) => {
        traslado = { id: x.id ?? 'tr-1', ...x };
        return traslado;
      }),
    },
    TrasladoItem: {
      find: jest.fn(async () => items),
      save: jest.fn(async (x) => x),
    },
  };
  const manager = {
    getRepository: (e: { name: string }) => repos[e.name],
    query: jest.fn(async (sql: string) =>
      sql.includes('MAX') ? [{ max: o.maxConsecutivo ?? 0 }] : (o.visibles ?? []).map((b) => ({ bodega_id: b })),
    ),
  };
  const dataSource = { transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)), manager };
  const contexto: Fila = { negocioId: 'neg-1', usuarioId: 'usr-1', sucursalId: o.sucursalId ?? null, rolId: 'rol-1' };
  const cls = { get: (k: string) => contexto[k] };
  const alertas = { verificarStockItem: jest.fn() };
  const auditoria = { registrarAccion: jest.fn() };
  const permisos = { rolTienePermiso: jest.fn().mockResolvedValue(o.puedeEnviar ?? true) };
  const service = new TrasladosService(dataSource as any, cls as any, alertas as any, auditoria as any, permisos as any);
  return { service, inventarios, movimientos, auditoria, alertas, trasladoActual: () => traslado, items };
}

const cantidad = (e: ReturnType<typeof entorno>, clave: string) => Number(e.inventarios.get(clave)?.cantidad);

describe('TrasladosService.enviar', () => {
  const dto = (cant = 4) => ({
    bodegaOrigenId: 'bod-cedi',
    bodegaDestinoId: 'bod-norte',
    items: [{ productoId: 'prod-1', cantidad: cant }],
  });

  it('descuenta el origen, numera TR-n, registra TRASLADO_SALIDA y audita', async () => {
    const e = entorno({ inventarios: { 'prod-1:bod-cedi': 10 }, maxConsecutivo: 4 });
    const t = await e.service.enviar(dto());
    expect(cantidad(e, 'prod-1:bod-cedi')).toBe(6);
    expect(t).toEqual(expect.objectContaining({ consecutivo: 5, estado: EstadoTraslado.EN_TRANSITO, enviadoPor: 'usr-1' }));
    expect(e.movimientos).toEqual([
      expect.objectContaining({ tipo: TipoMovimientoInventario.TRASLADO_SALIDA, bodegaId: 'bod-cedi', cantidad: 4, trasladoId: 'tr-1' }),
    ]);
    expect(e.auditoria.registrarAccion).toHaveBeenCalledWith(expect.objectContaining({ etiqueta: 'TR-5' }));
    expect(e.alertas.verificarStockItem).toHaveBeenCalledTimes(1);
  });

  it('rechaza si no alcanza el stock y no guarda nada', async () => {
    const e = entorno({ inventarios: { 'prod-1:bod-cedi': 3 } });
    await expect(e.service.enviar(dto(4))).rejects.toThrow('No hay stock suficiente de "Arena" en CEDI (disponible: 3)');
    expect(e.trasladoActual()).toBeNull();
    expect(e.movimientos).toEqual([]);
  });

  it('rechaza origen igual a destino', async () => {
    const e = entorno({ inventarios: { 'prod-1:bod-cedi': 10 } });
    await expect(e.service.enviar({ ...dto(), bodegaDestinoId: 'bod-cedi' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza un producto repetido', async () => {
    const e = entorno({ inventarios: { 'prod-1:bod-cedi': 10 } });
    await expect(
      e.service.enviar({ ...dto(), items: [{ productoId: 'prod-1', cantidad: 1 }, { productoId: 'prod-1', cantidad: 2 }] }),
    ).rejects.toThrow('Un producto aparece más de una vez en el traslado');
  });
});

const EN_TRANSITO = {
  id: 'tr-1',
  negocioId: 'neg-1',
  consecutivo: 7,
  bodegaOrigenId: 'bod-cedi',
  bodegaDestinoId: 'bod-norte',
  estado: EstadoTraslado.EN_TRANSITO,
};
const COMPLETO = { items: [{ productoId: 'prod-1', cantidadRecibida: 10 }, { productoId: 'prod-2', cantidadRecibida: 3 }] };

describe('TrasladosService.recibir', () => {
  const items = [
    { id: 'it-1', trasladoId: 'tr-1', productoId: 'prod-1', cantidadEnviada: '10.00', cantidadRecibida: null },
    { id: 'it-2', trasladoId: 'tr-1', productoId: 'prod-2', cantidadEnviada: '3.00', cantidadRecibida: null },
  ];

  it('completo: suma al destino (creando la fila si no existía) y cierra el traslado', async () => {
    const e = entorno({ traslado: EN_TRANSITO, items, inventarios: { 'prod-2:bod-norte': 1 } });
    const t = await e.service.recibir('tr-1', COMPLETO);
    expect(cantidad(e, 'prod-1:bod-norte')).toBe(10);
    expect(cantidad(e, 'prod-2:bod-norte')).toBe(4);
    expect(t).toEqual(expect.objectContaining({ estado: EstadoTraslado.RECIBIDO, recibidoPor: 'usr-1' }));
    expect(e.movimientos.every((m) => m.tipo === TipoMovimientoInventario.TRASLADO_ENTRADA)).toBe(true);
    expect(e.items.map((i) => i.cantidadRecibida)).toEqual([10, 3]);
  });

  it('con faltante: entra lo recibido y registra FALTANTE_TRASLADO sin mover stock', async () => {
    const e = entorno({ traslado: EN_TRANSITO, items });
    await e.service.recibir('tr-1', { items: [{ productoId: 'prod-1', cantidadRecibida: 8 }, { productoId: 'prod-2', cantidadRecibida: 3 }] });
    expect(cantidad(e, 'prod-1:bod-norte')).toBe(8);
    expect(e.movimientos).toContainEqual(
      expect.objectContaining({ tipo: TipoMovimientoInventario.FALTANTE_TRASLADO, productoId: 'prod-1', bodegaId: 'bod-norte', cantidad: 2 }),
    );
    expect(e.auditoria.registrarAccion).toHaveBeenCalledWith(
      expect.objectContaining({ descripcion: expect.stringContaining('con faltantes en 1 producto') }),
    );
  });

  it('rechaza recibir más de lo enviado', async () => {
    const e = entorno({ traslado: EN_TRANSITO, items });
    await expect(
      e.service.recibir('tr-1', { items: [{ productoId: 'prod-1', cantidadRecibida: 11 }, { productoId: 'prod-2', cantidadRecibida: 3 }] }),
    ).rejects.toThrow('No puedes recibir más de lo enviado');
  });

  it('exige la cantidad de cada producto, una sola vez', async () => {
    const e = entorno({ traslado: EN_TRANSITO, items });
    await expect(e.service.recibir('tr-1', { items: [{ productoId: 'prod-1', cantidadRecibida: 10 }] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('no recibe un traslado que ya no está en tránsito', async () => {
    const e = entorno({ traslado: { ...EN_TRANSITO, estado: EstadoTraslado.RECIBIDO }, items });
    await expect(e.service.recibir('tr-1', COMPLETO)).rejects.toThrow(ConflictException);
  });

  it('un cajero (sin CREAR, con sucursal) no recibe en una bodega que no es de su sucursal', async () => {
    const e = entorno({ traslado: EN_TRANSITO, items, sucursalId: 'suc-sur', puedeEnviar: false, visibles: ['bod-sur'] });
    await expect(e.service.recibir('tr-1', COMPLETO)).rejects.toThrow(ForbiddenException);
  });

  it('un cajero sí recibe en la bodega de su sucursal', async () => {
    const e = entorno({ traslado: EN_TRANSITO, items, sucursalId: 'suc-norte', puedeEnviar: false, visibles: ['bod-norte'] });
    const t = await e.service.recibir('tr-1', COMPLETO);
    expect(t.estado).toBe(EstadoTraslado.RECIBIDO);
  });
});

describe('TrasladosService.cancelar', () => {
  const items = [{ id: 'it-1', trasladoId: 'tr-1', productoId: 'prod-1', cantidadEnviada: '4.00', cantidadRecibida: null }];

  it('devuelve todo al origen y marca CANCELADO', async () => {
    const e = entorno({ traslado: EN_TRANSITO, items, inventarios: { 'prod-1:bod-cedi': 6 } });
    const t = await e.service.cancelar('tr-1');
    expect(cantidad(e, 'prod-1:bod-cedi')).toBe(10);
    expect(e.movimientos).toEqual([
      expect.objectContaining({
        tipo: TipoMovimientoInventario.TRASLADO_CANCELADO,
        bodegaId: 'bod-cedi',
        cantidad: 4,
        motivo: 'Traslado TR-7 cancelado',
      }),
    ]);
    expect(t).toEqual(expect.objectContaining({ estado: EstadoTraslado.CANCELADO, canceladoPor: 'usr-1' }));
  });

  it('no cancela un traslado recibido', async () => {
    const e = entorno({ traslado: { ...EN_TRANSITO, estado: EstadoTraslado.RECIBIDO }, items });
    await expect(e.service.cancelar('tr-1')).rejects.toThrow(ConflictException);
  });
});

describe('TrasladosService.listar', () => {
  it('un cajero cuya sucursal no tiene bodegas no ve nada (sin consultar)', async () => {
    const e = entorno({ sucursalId: 'suc-x', puedeEnviar: false, visibles: [] });
    await expect(e.service.listar({})).resolves.toEqual([]);
  });
});
