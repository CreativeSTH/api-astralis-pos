import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { VentasService } from './ventas.service';
import { Venta } from './entities/venta.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { MovimientoSaldoCliente } from '../clientes/entities/movimiento-saldo-cliente.entity';
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

type ConSaldo = {
  cobrarSaldoAFavor: (
    manager: unknown,
    p: { negocioId: string; clienteId?: string; pagos: { metodoPago: string; monto: number }[] },
  ) => Promise<number>;
  registrarUsoSaldoAFavor: (
    manager: unknown,
    p: { negocioId: string; clienteId: string; monto: number; ventaId: string; usuarioId: string },
  ) => Promise<void>;
  validarMetodosPago: (nombres: string[]) => Promise<void>;
};

/** Pagar con "Saldo a favor" (spec de devoluciones 3.4). */
describe('VentasService — saldo a favor', () => {
  let service: ConSaldo;
  let clientes: { findOne: jest.Mock; save: jest.Mock };
  let movimientos: { create: jest.Mock; save: jest.Mock };
  let manager: { getRepository: (e: unknown) => unknown };

  beforeEach(async () => {
    clientes = { findOne: jest.fn().mockResolvedValue({ id: 'cli-1', saldoAFavor: '20000.00' }), save: jest.fn(async (c) => c) };
    movimientos = { create: jest.fn((m) => m), save: jest.fn(async (m) => m) };
    const repos = new Map<unknown, unknown>([
      [Cliente, clientes],
      [MovimientoSaldoCliente, movimientos],
    ]);
    manager = { getRepository: (e: unknown) => repos.get(e) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        VentasService,
        { provide: getRepositoryToken(Venta), useValue: {} },
        { provide: getRepositoryToken(Inventario), useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: CajaService, useValue: {} },
        { provide: ClientesService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: PermisosService, useValue: {} },
        { provide: AlertasService, useValue: {} },
        { provide: RealtimeGateway, useValue: {} },
        { provide: MetodosPagoService, useValue: { findAll: jest.fn().mockResolvedValue([{ nombre: 'Efectivo' }]) } },
        { provide: NumeracionComprobanteService, useValue: {} },
        { provide: PromocionesPricingService, useValue: {} },
        { provide: CuponValidacionService, useValue: {} },
        { provide: FacturacionElectronicaService, useValue: {} },
        { provide: PoliticaFacturacionService, useValue: {} },
        { provide: ContingenciaService, useValue: {} },
        { provide: ClsService, useValue: { get: (k: string) => (k === 'negocioId' ? 'neg-1' : 'usr-1') } },
      ],
    }).compile();
    service = moduleRef.get(VentasService) as unknown as ConSaldo;
  });

  it('descuenta el saldo del cliente con lock y devuelve lo usado', async () => {
    const usado = await service.cobrarSaldoAFavor(manager, {
      negocioId: 'neg-1',
      clienteId: 'cli-1',
      pagos: [
        { metodoPago: 'Saldo a favor', monto: 15_000 },
        { metodoPago: 'Efectivo', monto: 5_000 },
      ],
    });
    expect(usado).toBe(15_000);
    expect(clientes.findOne).toHaveBeenCalledWith({ where: { id: 'cli-1', negocioId: 'neg-1' }, lock: { mode: 'pessimistic_write' } });
    expect(clientes.save).toHaveBeenCalledWith(expect.objectContaining({ saldoAFavor: 5_000 }));
  });

  it('sin pagos con saldo no toca al cliente', async () => {
    expect(await service.cobrarSaldoAFavor(manager, { negocioId: 'neg-1', clienteId: 'cli-1', pagos: [{ metodoPago: 'Efectivo', monto: 1 }] })).toBe(0);
    expect(clientes.findOne).not.toHaveBeenCalled();
  });

  it('saldo a favor sin cliente → 400', async () => {
    await expect(
      service.cobrarSaldoAFavor(manager, { negocioId: 'neg-1', pagos: [{ metodoPago: 'Saldo a favor', monto: 1 }] }),
    ).rejects.toThrow('necesita un cliente');
  });

  it('saldo a favor mayor al disponible → 400', async () => {
    await expect(
      service.cobrarSaldoAFavor(manager, { negocioId: 'neg-1', clienteId: 'cli-1', pagos: [{ metodoPago: 'Saldo a favor', monto: 20_001 }] }),
    ).rejects.toThrow('Saldo a favor insuficiente');
    expect(clientes.save).not.toHaveBeenCalled();
  });

  it('registra el uso como movimiento negativo USO_EN_VENTA', async () => {
    await service.registrarUsoSaldoAFavor(manager, { negocioId: 'neg-1', clienteId: 'cli-1', monto: 15_000, ventaId: 'v-1', usuarioId: 'usr-1' });
    expect(movimientos.save).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'USO_EN_VENTA', monto: -15_000, ventaId: 'v-1', clienteId: 'cli-1', devolucionId: null }),
    );
  });

  it('"Saldo a favor" se acepta aunque no sea un método de pago del negocio', async () => {
    await expect(service.validarMetodosPago(['Saldo a favor', 'Efectivo'])).resolves.toBeUndefined();
    await expect(service.validarMetodosPago(['Bitcoin'])).rejects.toThrow('no es un método de pago activo');
  });
});
