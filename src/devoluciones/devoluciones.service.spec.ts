import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DevolucionesService } from './devoluciones.service';
import { Devolucion } from './entities/devolucion.entity';
import { DevolucionItem } from './entities/devolucion-item.entity';
import { DevolucionReembolso } from './entities/devolucion-reembolso.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { VentaItem } from '../ventas/entities/venta-item.entity';
import { Cuota } from '../ventas/entities/cuota.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
import { MovimientoInventario } from '../inventario/entities/movimiento-inventario.entity';
import { MovimientoCaja } from '../caja/entities/movimiento-caja.entity';
import { TurnoCaja } from '../caja/entities/turno-caja.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { MovimientoSaldoCliente } from '../clientes/entities/movimiento-saldo-cliente.entity';
import { DocumentoElectronico } from '../facturacion-electronica/entities/documento-electronico.entity';
import { NumeracionComprobanteService } from '../facturacion/numeracion-comprobante.service';
import { AuthService } from '../auth/auth.service';
import { PermisosService } from '../roles/permisos.service';
import { CajaService } from '../caja/caja.service';
import { MetodosPagoService } from '../metodos-pago/metodos-pago.service';
import { FacturacionElectronicaService } from '../facturacion-electronica/facturacion-electronica.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TipoNumeracion } from '../common/enums/tipo-comprobante.enum';

/** Repositorio falso con lo que usa el servicio; `create` devuelve lo mismo y `save` asigna id. */
function repo(extra: Record<string, unknown> = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: Record<string, unknown>) => ({ id: x.id ?? 'nuevo-id', ...x })),
    update: jest.fn(),
    increment: jest.fn(),
    decrement: jest.fn(),
    ...extra,
  };
}

/** QueryBuilder de `cantidadesDevueltas`: devuelve las filas (ventaItemId, cantidad) que se le den. */
function qbDevueltas(filas: { ventaItemId: string; cantidad: string }[] = []) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['innerJoin', 'select', 'addSelect', 'where', 'groupBy']) qb[m] = jest.fn(() => qb);
  qb.getRawMany = jest.fn().mockResolvedValue(filas);
  return qb;
}

// Línea de 3 unidades a 10.000 + IVA 19 % (subtotal 35.700) y otra de 1 unidad a 20.000 (23.800). Total 59.500.
const ITEMS = [
  { id: 'item-a', productoId: 'prod-a', nombreProducto: 'Martillo', cantidad: 3, precioUnitario: 10_000, descuento: 0, baseImponible: 30_000, impuesto: 5_700, subtotal: 35_700 },
  { id: 'item-b', productoId: 'prod-b', nombreProducto: 'Taladro', cantidad: 1, precioUnitario: 20_000, descuento: 0, baseImponible: 20_000, impuesto: 3_800, subtotal: 23_800 },
];

describe('DevolucionesService', () => {
  let service: DevolucionesService;
  let venta: Record<string, any>;
  let repos: Map<unknown, ReturnType<typeof repo>>;
  let documentos: ReturnType<typeof repo>;
  let permisos: { rolTienePermiso: jest.Mock };
  let auth: { autorizarConPin: jest.Mock };
  let facturacion: { registrarNotaCredito: jest.Mock };
  let numeracion: { siguienteNumero: jest.Mock };
  let devueltasPrevias: { ventaItemId: string; cantidad: string }[];

  const UNA_UNIDAD_A = 11_900;

  beforeEach(async () => {
    venta = {
      id: 'venta-1', negocioId: 'neg-1', sucursalId: 'suc-1', bodegaId: 'bod-1', clienteId: 'cli-1',
      tipoVenta: 'CONTADO', estado: 'COMPLETADA', estadoDevolucion: 'NINGUNA', descuentoTotal: 0, total: 59_500,
      numeroComprobante: 'R-15', items: ITEMS.map((i) => ({ ...i })), cuotas: [],
    };
    devueltasPrevias = [];
    documentos = repo({ findOne: jest.fn().mockResolvedValue(null) });
    repos = new Map<unknown, ReturnType<typeof repo>>([
      [Venta, repo({ findOne: jest.fn(async () => venta) })],
      [VentaItem, repo({ find: jest.fn(async () => venta.items) })],
      [Cuota, repo({ find: jest.fn(async () => venta.cuotas) })],
      [Inventario, repo({ findOne: jest.fn(async () => ({ id: 'inv-1', cantidad: 5 })) })],
      [MovimientoInventario, repo()],
      [MovimientoCaja, repo()],
      [TurnoCaja, repo({ findOne: jest.fn().mockResolvedValue({ id: 'turno-abierto' }) })],
      [Cliente, repo()],
      [MovimientoSaldoCliente, repo()],
      [Devolucion, repo()],
      [DevolucionItem, repo({ createQueryBuilder: jest.fn(() => qbDevueltas(devueltasPrevias)) })],
      [DevolucionReembolso, repo()],
      [DocumentoElectronico, documentos],
    ]);
    const manager = { getRepository: (entidad: unknown) => repos.get(entidad) };
    permisos = { rolTienePermiso: jest.fn().mockResolvedValue(true) };
    auth = { autorizarConPin: jest.fn().mockResolvedValue({ id: 'admin-1' }) };
    facturacion = { registrarNotaCredito: jest.fn().mockResolvedValue(undefined) };
    numeracion = { siguienteNumero: jest.fn().mockResolvedValue({ numero: 1, numeroFormateado: 'DEV-1' }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DevolucionesService,
        { provide: getRepositoryToken(Venta), useValue: repos.get(Venta) },
        { provide: getRepositoryToken(Devolucion), useValue: repos.get(Devolucion) },
        { provide: getRepositoryToken(DevolucionItem), useValue: repos.get(DevolucionItem) },
        { provide: getRepositoryToken(DocumentoElectronico), useValue: documentos },
        { provide: getRepositoryToken(TurnoCaja), useValue: repos.get(TurnoCaja) },
        { provide: DataSource, useValue: { transaction: jest.fn((cb) => cb(manager)) } },
        { provide: NumeracionComprobanteService, useValue: numeracion },
        { provide: AuthService, useValue: auth },
        { provide: PermisosService, useValue: permisos },
        { provide: CajaService, useValue: { resumen: jest.fn().mockResolvedValue({ efectivoEsperado: 500_000 }) } },
        { provide: MetodosPagoService, useValue: { findAll: jest.fn().mockResolvedValue([{ nombre: 'Efectivo', esEfectivo: true }]) } },
        { provide: FacturacionElectronicaService, useValue: facturacion },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
        { provide: ClsService, useValue: { get: (k: string) => ({ negocioId: 'neg-1', usuarioId: 'usr-1', rolId: 'rol-1' })[k] } },
      ],
    }).compile();
    service = moduleRef.get(DevolucionesService);
  });

  const dto = (over: Record<string, unknown> = {}) => ({
    ventaId: 'venta-1',
    motivo: 'Defectuoso',
    items: [{ ventaItemId: 'item-a', cantidad: 1, vuelveAInventario: true }],
    reembolsos: [{ forma: 'EFECTIVO' as const, monto: UNA_UNIDAD_A }],
    ...over,
  });

  describe('devolvible', () => {
    it('404 si la venta es de otro negocio', async () => {
      repos.get(Venta)!.findOne.mockResolvedValue(null);
      await expect(service.devolvible('venta-ajena')).rejects.toThrow('Venta no encontrada');
    });

    it('informa el bloqueo cuando la factura electrónica está en validación', async () => {
      documentos.findOne.mockResolvedValue({ estado: 'PENDIENTE', periodoContingenciaId: null });
      expect((await service.devolvible('venta-1')).bloqueo).toMatch(/DIAN/);
    });

    it('resta lo ya devuelto de cada línea y calcula el neto por unidad', async () => {
      devueltasPrevias = [{ ventaItemId: 'item-a', cantidad: '2' }];
      const r = await service.devolvible('venta-1');
      expect(r.lineas.find((l) => l.ventaItemId === 'item-a')).toMatchObject({ vendida: 3, devuelta: 2, disponible: 1, netoPorUnidad: 11_900 });
      expect(r).toMatchObject({ numeroVenta: 'R-15', tieneCliente: true, efectivoDisponible: 500_000, bloqueo: null, saldoDeudaVenta: 0 });
    });
  });

  describe('crear', () => {
    it('sin permiso y sin PIN → 403', async () => {
      permisos.rolTienePermiso.mockResolvedValue(false);
      await expect(service.crear(dto())).rejects.toThrow('PIN');
    });

    it('sin permiso con PIN válido → autoriza el dueño del PIN', async () => {
      permisos.rolTienePermiso.mockResolvedValue(false);
      const d = await service.crear(dto({ pinAutorizacion: '1234' }));
      expect(auth.autorizarConPin).toHaveBeenCalledWith('neg-1', '1234', 'DEVOLUCIONES', 'CREAR');
      expect(d.autorizadoPor).toBe('admin-1');
    });

    it('venta cancelada → 400', async () => {
      venta.estado = 'CANCELADA';
      await expect(service.crear(dto())).rejects.toThrow('cancelada');
    });

    it('factura no aceptada → 400 y no guarda nada', async () => {
      documentos.findOne.mockResolvedValue({ estado: 'RECHAZADO', periodoContingenciaId: null });
      await expect(service.crear(dto())).rejects.toThrow('DIAN');
      expect(repos.get(Devolucion)!.save).not.toHaveBeenCalled();
    });

    it('efectivo → EGRESO en el turno abierto de la sucursal con el método efectivo y numeración DEV', async () => {
      const d = await service.crear(dto());
      expect(numeracion.siguienteNumero).toHaveBeenCalledWith(expect.anything(), 'neg-1', 'suc-1', TipoNumeracion.DEVOLUCION);
      expect(repos.get(MovimientoCaja)!.save).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'EGRESO', turnoId: 'turno-abierto', metodoPago: 'Efectivo', monto: UNA_UNIDAD_A, ventaId: 'venta-1', concepto: 'Devolución DEV-1' }),
      );
      expect(d).toMatchObject({ numeroCompleto: 'DEV-1', total: UNA_UNIDAD_A, baseTotal: 10_000, impuestoTotal: 1_900, turnoId: 'turno-abierto' });
    });

    it('efectivo sin turno abierto → 400', async () => {
      repos.get(TurnoCaja)!.findOne.mockResolvedValue(null);
      await expect(service.crear(dto())).rejects.toThrow('turno de caja abierto');
    });

    it('vuelve al inventario: suma stock + kardex DEVOLUCION; no vuelve: kardex BAJA_DEVOLUCION sin tocar stock', async () => {
      await service.crear(
        dto({
          items: [
            { ventaItemId: 'item-a', cantidad: 1, vuelveAInventario: true },
            { ventaItemId: 'item-b', cantidad: 1, vuelveAInventario: false, motivoBaja: 'Roto' },
          ],
          reembolsos: [{ forma: 'EFECTIVO', monto: 35_700 }],
        }),
      );
      expect(repos.get(Inventario)!.save).toHaveBeenCalledTimes(1);
      expect(repos.get(Inventario)!.save).toHaveBeenCalledWith(expect.objectContaining({ cantidad: 6 }));
      const kardex = repos.get(MovimientoInventario)!.save.mock.calls.map((c) => c[0]);
      expect(kardex).toEqual([
        expect.objectContaining({ productoId: 'prod-a', tipo: 'DEVOLUCION', cantidad: 1 }),
        expect.objectContaining({ productoId: 'prod-b', tipo: 'BAJA_DEVOLUCION', cantidad: 1, motivo: 'Devolución DEV-1 — no vuelve: Roto' }),
      ]);
    });

    it('descuento de deuda: baja saldoPendiente desde la última cuota y la deuda del cliente', async () => {
      venta.tipoVenta = 'CREDITO';
      venta.cuotas = [
        { id: 'c1', numero: 1, saldoPendiente: 0, montoTotalConMora: 0, pagada: true },
        { id: 'c2', numero: 2, saldoPendiente: 10_000, montoTotalConMora: 10_000, pagada: false },
        { id: 'c3', numero: 3, saldoPendiente: 10_000, montoTotalConMora: 10_000, pagada: false },
      ];
      await service.crear(dto({ reembolsos: [{ forma: 'DESCUENTO_DEUDA', monto: UNA_UNIDAD_A }] }));
      const cuotas = repos.get(Cuota)!.save.mock.calls.map((c) => c[0]);
      expect(cuotas).toEqual([
        expect.objectContaining({ id: 'c3', saldoPendiente: 0, pagada: true }),
        expect.objectContaining({ id: 'c2', saldoPendiente: 8_100, pagada: false }),
      ]);
      expect(repos.get(Cliente)!.decrement).toHaveBeenCalledWith({ id: 'cli-1', negocioId: 'neg-1' }, 'deudaActual', UNA_UNIDAD_A);
      expect(repos.get(MovimientoCaja)!.save).not.toHaveBeenCalled();
    });

    it('descuento de deuda que cubre todo el saldo deja la venta COMPLETADA', async () => {
      venta.tipoVenta = 'CREDITO';
      venta.cuotas = [{ id: 'c1', numero: 1, saldoPendiente: UNA_UNIDAD_A, montoTotalConMora: UNA_UNIDAD_A, pagada: false }];
      await service.crear(dto({ reembolsos: [{ forma: 'DESCUENTO_DEUDA', monto: UNA_UNIDAD_A }] }));
      expect(repos.get(Venta)!.update).toHaveBeenCalledWith('venta-1', { estado: 'COMPLETADA' });
    });

    it('saldo a favor: suma al cliente y registra ABONO_DEVOLUCION', async () => {
      await service.crear(dto({ reembolsos: [{ forma: 'SALDO_A_FAVOR', monto: UNA_UNIDAD_A }] }));
      expect(repos.get(Cliente)!.increment).toHaveBeenCalledWith({ id: 'cli-1', negocioId: 'neg-1' }, 'saldoAFavor', UNA_UNIDAD_A);
      expect(repos.get(MovimientoSaldoCliente)!.save).toHaveBeenCalledWith(
        expect.objectContaining({ clienteId: 'cli-1', tipo: 'ABONO_DEVOLUCION', monto: UNA_UNIDAD_A, ventaId: 'venta-1' }),
      );
    });

    it('una parte deja la venta PARCIAL; devolver todo, TOTAL', async () => {
      await service.crear(dto());
      expect(repos.get(Venta)!.update).toHaveBeenCalledWith('venta-1', { estadoDevolucion: 'PARCIAL' });

      repos.get(Venta)!.update.mockClear();
      await service.crear(
        dto({
          items: [
            { ventaItemId: 'item-a', cantidad: 3, vuelveAInventario: true },
            { ventaItemId: 'item-b', cantidad: 1, vuelveAInventario: true },
          ],
          reembolsos: [{ forma: 'EFECTIVO', monto: 59_500 }],
        }),
      );
      expect(repos.get(Venta)!.update).toHaveBeenCalledWith('venta-1', { estadoDevolucion: 'TOTAL' });
    });

    it('cantidades ya devueltas cuentan: no deja pasarse de lo vendido', async () => {
      devueltasPrevias = [{ ventaItemId: 'item-a', cantidad: '3' }];
      await expect(service.crear(dto())).rejects.toThrow('Solo quedan 0');
    });

    it('con factura aceptada pide la nota crédito después de confirmar (sin esperarla)', async () => {
      documentos.findOne.mockResolvedValue({ estado: 'ACEPTADO', periodoContingenciaId: null });
      const d = await service.crear(dto());
      expect(facturacion.registrarNotaCredito).toHaveBeenCalledWith(d.id, 'neg-1', { quedaTotal: false, esPrimeraDevolucion: true });
    });

    it('venta con recibo (sin factura electrónica) no pide nota crédito', async () => {
      await service.crear(dto());
      expect(facturacion.registrarNotaCredito).not.toHaveBeenCalled();
    });
  });
});
