import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { VentasService } from './ventas.service';
import { Venta } from './entities/venta.entity';
import { Cuota } from './entities/cuota.entity';
import { RegistroPagoCuota } from './entities/registro-pago-cuota.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
import { MovimientoCaja } from '../caja/entities/movimiento-caja.entity';
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
import { TipoNumeracion } from '../common/enums/tipo-comprobante.enum';

describe('VentasService.abonarCuota — recibo de caja', () => {
  let service: VentasService;
  let registros: { create: jest.Mock; save: jest.Mock };
  let numeracion: { siguienteNumero: jest.Mock };
  let clientes: { ajustarDeuda: jest.Mock };
  let venta: any;

  beforeEach(async () => {
    venta = {
      id: 'venta-1',
      negocioId: 'neg-1',
      sucursalId: 'suc-1',
      clienteId: 'cli-1',
      tipoVenta: 'CREDITO',
      estado: 'ACTIVA',
      tasaInteresMora: 0,
      cuotas: [
        {
          id: 'c1',
          numero: 1,
          monto: 100_000,
          montoPagado: 0,
          saldoPendiente: 100_000,
          pagada: false,
          montoMora: 0,
          montoTotalConMora: 100_000,
          fechaVencimiento: '2099-01-01',
        },
        {
          id: 'c2',
          numero: 2,
          monto: 100_000,
          montoPagado: 0,
          saldoPendiente: 100_000,
          pagada: false,
          montoMora: 0,
          montoTotalConMora: 100_000,
          fechaVencimiento: '2099-02-01',
        },
      ],
    };
    registros = {
      create: jest.fn((r) => r),
      save: jest.fn(async (r) => ({ id: 'abono-1', ...r })),
    };
    const repos = new Map<unknown, unknown>([
      [
        Venta,
        { findOne: jest.fn(async () => venta), save: jest.fn(async (v) => v) },
      ],
      [
        Cuota,
        {
          save: jest.fn(async (c) => c),
          find: jest.fn(async () => venta.cuotas),
        },
      ],
      [RegistroPagoCuota, registros],
      [MovimientoCaja, { create: jest.fn((m) => m), save: jest.fn() }],
    ]);
    const manager = { getRepository: (entidad: unknown) => repos.get(entidad) };
    numeracion = {
      siguienteNumero: jest
        .fn()
        .mockResolvedValue({ numero: 7, numeroFormateado: 'RC-7' }),
    };
    clientes = { ajustarDeuda: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VentasService,
        { provide: getRepositoryToken(Venta), useValue: {} },
        { provide: getRepositoryToken(Inventario), useValue: {} },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn((cb) => cb(manager)) },
        },
        {
          provide: CajaService,
          useValue: {
            obtenerTurnoAbierto: jest
              .fn()
              .mockRejectedValue(new Error('sin turno')),
          },
        },
        { provide: ClientesService, useValue: clientes },
        { provide: AuthService, useValue: {} },
        { provide: PermisosService, useValue: {} },
        { provide: AlertasService, useValue: {} },
        { provide: RealtimeGateway, useValue: {} },
        {
          provide: MetodosPagoService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([{ nombre: 'Efectivo' }]),
          },
        },
        { provide: NumeracionComprobanteService, useValue: numeracion },
        { provide: PromocionesPricingService, useValue: {} },
        { provide: CuponValidacionService, useValue: {} },
        { provide: FacturacionElectronicaService, useValue: {} },
        { provide: PoliticaFacturacionService, useValue: {} },
        { provide: ContingenciaService, useValue: {} },
        {
          provide: ClsService,
          useValue: {
            get: (k: string) => (k === 'negocioId' ? 'neg-1' : 'usr-1'),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(VentasService);
  });

  it('numera el recibo de caja en la sucursal de la venta y guarda la foto del abono', async () => {
    const r = await service.abonarCuota('venta-1', {
      numeroCuota: 1,
      montoAbono: 40_000,
      metodoPago: 'Efectivo',
    });

    expect(numeracion.siguienteNumero).toHaveBeenCalledWith(
      expect.anything(),
      'neg-1',
      'suc-1',
      TipoNumeracion.RECIBO_CAJA,
    );
    expect(registros.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cuotaId: 'c1',
        monto: 40_000,
        metodoPago: 'Efectivo',
        registradoPor: 'usr-1',
        numeroRecibo: 'RC-7',
        sucursalId: 'suc-1',
        moraPagada: 0,
        saldoVentaAnterior: 200_000,
        saldoVentaNuevo: 160_000,
      }),
    );
    expect(r.abono).toEqual({ id: 'abono-1', numeroRecibo: 'RC-7' });
    expect(clientes.ajustarDeuda).toHaveBeenCalledWith('cli-1', -40_000);
  });
});
