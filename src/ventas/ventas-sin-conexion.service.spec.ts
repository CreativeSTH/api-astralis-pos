import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { VentasService } from './ventas.service';
import { Venta } from './entities/venta.entity';
import { VentaItem } from './entities/venta-item.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
import { Producto } from '../productos/entities/producto.entity';
import { Bodega } from '../bodegas/entities/bodega.entity';
import { CajaService } from '../caja/caja.service';
import { ClientesService } from '../clientes/clientes.service';
import { AuthService } from '../auth/auth.service';
import { PermisosService } from '../roles/permisos.service';
import { AlertasService } from '../alertas/alertas.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MetodosPagoService } from '../metodos-pago/metodos-pago.service';
import { NumeracionComprobanteService } from '../facturacion/numeracion-comprobante.service';
import { PromocionesPricingService } from '../cupones/promociones-pricing.service';
import { CuponValidacionService } from '../cupones/cupon-validacion.service';
import { FacturacionElectronicaService } from '../facturacion-electronica/facturacion-electronica.service';
import { PoliticaFacturacionService } from '../politica-facturacion/politica-facturacion.service';
import { ContingenciaService } from '../facturacion-electronica/contingencia.service';
import { SincronizarSinConexionDto } from './dto/sincronizar-sin-conexion.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';

/** Fase 6b: registrar lo que una caja vendió sin conexión. */
describe('VentasService — ventas sin conexión', () => {
  let service: VentasService;
  let ventasRepo: { findOne: jest.Mock };
  let contingencia: { asegurarPeriodoSinConexion: jest.Mock };
  let pricing: { precioEfectivo: jest.Mock };

  const EPISODIO = { id: '5c7f0a1e-0000-4000-8000-000000000001', inicio: '2026-09-29T15:00:00.000Z', fin: '2026-09-29T17:00:00.000Z' };
  const VENTA = {
    idLocal: '5c7f0a1e-0000-4000-8000-0000000000aa',
    episodioId: EPISODIO.id,
    creadaEn: '2026-09-29T15:30:00.000Z',
    turnoId: 't-1',
    sucursalId: 'suc-1',
    bodegaId: 'bod-1',
    tipoVenta: 'CONTADO',
    nombreCliente: 'Consumidor final',
    items: [{ productoId: 'prod-1', cantidad: 1, precioUnitario: 27000, porcentajeImpuesto: 19 }],
    pagos: [{ metodoPago: 'Efectivo', monto: 32130 }],
    comprobante: {
      tipo: 'CONTINGENCIA',
      numero: 7,
      numeroImpreso: 'CONT7',
      resolucion: { numero: '18764000009999', prefijo: 'CONT', fechaInicio: '2026-01-01', fechaFin: '2028-01-01', rangoDesde: 1, rangoHasta: 5000 },
    },
  };
  const dto = (ventas: unknown[]) => ({ episodios: [EPISODIO], ventas }) as unknown as SincronizarSinConexionDto;
  type ConOpciones = { crearConOpciones: () => Promise<unknown> };

  beforeEach(async () => {
    ventasRepo = { findOne: jest.fn().mockResolvedValue(null) };
    contingencia = { asegurarPeriodoSinConexion: jest.fn().mockResolvedValue({ id: 'per-ep' }) };
    pricing = { precioEfectivo: jest.fn().mockResolvedValue({ precio: 99999, promocionId: 'promo-1' }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        VentasService,
        { provide: getRepositoryToken(Venta), useValue: ventasRepo },
        { provide: getRepositoryToken(Inventario), useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: CajaService, useValue: {} },
        { provide: ClientesService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: PermisosService, useValue: {} },
        { provide: AlertasService, useValue: {} },
        { provide: RealtimeGateway, useValue: {} },
        { provide: MetodosPagoService, useValue: {} },
        { provide: NumeracionComprobanteService, useValue: {} },
        { provide: PromocionesPricingService, useValue: pricing },
        { provide: CuponValidacionService, useValue: {} },
        { provide: FacturacionElectronicaService, useValue: {} },
        { provide: PoliticaFacturacionService, useValue: {} },
        { provide: ContingenciaService, useValue: contingencia },
        { provide: AuditoriaService, useValue: { registrarAccion: jest.fn() } },
        { provide: ClsService, useValue: { get: (k: string) => (k === 'negocioId' ? 'neg-1' : 'usr-1') } },
      ],
    }).compile();
    service = moduleRef.get(VentasService);
  });

  it('crea el período del episodio y registra la venta con sus datos de la caja', async () => {
    const crear = jest.spyOn(service as unknown as ConOpciones, 'crearConOpciones').mockResolvedValue({ id: 'v-1' });
    const r = await service.sincronizarSinConexion(dto([VENTA]));
    expect(contingencia.asegurarPeriodoSinConexion).toHaveBeenCalledWith('neg-1', EPISODIO);
    expect(r).toEqual([{ idLocal: VENTA.idLocal, estado: 'OK', ventaId: 'v-1' }]);
    const [datosVenta, opciones] = crear.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, any>];
    expect(datosVenta).toEqual(
      expect.objectContaining({ sucursalId: 'suc-1', bodegaId: 'bod-1', items: [{ productoId: 'prod-1', cantidad: 1 }], omitirValidacionCredito: true }),
    );
    expect(opciones.sinConexion).toEqual(
      expect.objectContaining({ idLocal: VENTA.idLocal, creadaEn: new Date(VENTA.creadaEn), turnoId: 't-1', numeroImpreso: 'CONT7' }),
    );
    expect(opciones.sinConexion.precios.get('prod-1')).toEqual({ precioUnitario: 27000, porcentajeImpuesto: 19 });
    expect(opciones.talonario).toEqual(
      expect.objectContaining({ numero: 7, periodoId: 'per-ep', transcrita: false, fecha: new Date(VENTA.creadaEn), resolucion: VENTA.comprobante.resolucion }),
    );
  });

  it('una venta ya sincronizada es DUPLICADA y no se crea otra', async () => {
    ventasRepo.findOne.mockResolvedValue({ id: 'v-vieja' });
    const crear = jest.spyOn(service as unknown as ConOpciones, 'crearConOpciones');
    const r = await service.sincronizarSinConexion(dto([VENTA]));
    expect(r).toEqual([{ idLocal: VENTA.idLocal, estado: 'DUPLICADA', ventaId: 'v-vieja' }]);
    expect(crear).not.toHaveBeenCalled();
  });

  it('un error en una venta no frena las demás', async () => {
    const otra = { ...VENTA, idLocal: '5c7f0a1e-0000-4000-8000-0000000000bb' };
    jest
      .spyOn(service as unknown as ConOpciones, 'crearConOpciones')
      .mockRejectedValueOnce(new BadRequestException('Producto prod-1 no encontrado'))
      .mockResolvedValueOnce({ id: 'v-2' });
    const r = await service.sincronizarSinConexion(dto([VENTA, otra]));
    expect(r[0]).toEqual({ idLocal: VENTA.idLocal, estado: 'ERROR', mensaje: 'Producto prod-1 no encontrado' });
    expect(r[1]).toEqual(expect.objectContaining({ estado: 'OK', ventaId: 'v-2' }));
  });

  it('recibo provisional: sin talonario ni período, conserva el número impreso', async () => {
    const recibo = { ...VENTA, comprobante: { tipo: 'RECIBO_PROVISIONAL', numeroImpreso: 'SCab12-3' } };
    const crear = jest.spyOn(service as unknown as ConOpciones, 'crearConOpciones').mockResolvedValue({ id: 'v-3' });
    await service.sincronizarSinConexion(dto([recibo]));
    const opciones = (crear.mock.calls[0] as unknown as [unknown, Record<string, any>])[1];
    expect(opciones.talonario).toBeUndefined();
    expect(opciones.sinConexion.numeroImpreso).toBe('SCab12-3');
    expect(contingencia.asegurarPeriodoSinConexion).not.toHaveBeenCalled();
  });

  describe('procesarItemsYStock sin conexión', () => {
    function managerFalso(inventario: Record<string, unknown> | null) {
      const guardados: unknown[] = [];
      const repos: Record<string, unknown> = {
        [Bodega.name]: { findOne: jest.fn().mockResolvedValue({ id: 'bod-1' }) },
        [Producto.name]: {
          findOne: jest.fn().mockResolvedValue({ id: 'prod-1', nombre: 'Arenita', precioVenta: 30000, costo: 10000, porcentajeImpuesto: 5 }),
        },
        [Inventario.name]: {
          findOne: jest.fn().mockResolvedValue(inventario),
          create: jest.fn((x) => ({ ...x })),
          save: jest.fn(async (x) => guardados.push({ ...x })),
        },
        [VentaItem.name]: { create: jest.fn((x) => x) },
      };
      return { manager: { getRepository: (e: { name: string }) => repos[e.name] }, guardados };
    }
    const procesar = (manager: unknown, cantidad: number) =>
      (service as unknown as { procesarItemsYStock: (...a: unknown[]) => Promise<any> }).procesarItemsYStock(
        manager,
        { sucursalId: 'suc-1', bodegaId: 'bod-1', items: [{ productoId: 'prod-1', cantidad }] },
        'neg-1',
        { precios: new Map([['prod-1', { precioUnitario: 27000, porcentajeImpuesto: 19 }]]) },
      );

    it('usa el precio y el impuesto impresos en la caja, sin promociones', async () => {
      const { manager } = managerFalso({ cantidad: 10 });
      const r = await procesar(manager, 1);
      expect(pricing.precioEfectivo).not.toHaveBeenCalled();
      expect(r.subtotal).toBe(27000);
      expect(r.impuestoTotal).toBeCloseTo(5130);
      expect(r.itemsEntities[0]).toEqual(expect.objectContaining({ precioUnitario: 27000, promocionId: undefined }));
    });

    it('permite dejar el stock negativo', async () => {
      const { manager, guardados } = managerFalso({ cantidad: 1 });
      await procesar(manager, 3);
      expect(guardados).toEqual([expect.objectContaining({ cantidad: -2 })]);
    });

    it('sin fila de inventario la crea en negativo', async () => {
      const { manager, guardados } = managerFalso(null);
      await procesar(manager, 2);
      expect(guardados).toEqual([expect.objectContaining({ negocioId: 'neg-1', productoId: 'prod-1', bodegaId: 'bod-1', cantidad: -2 })]);
    });
  });
});
