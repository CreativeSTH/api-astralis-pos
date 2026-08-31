import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SuscripcionesService } from './suscripciones.service';
import { Suscripcion } from './entities/suscripcion.entity';
import { EstadoSuscripcion } from './entities/estado-suscripcion.enum';
import { TransaccionSuscripcion } from './entities/transaccion-suscripcion.entity';
import { MedioPagoGuardado } from './entities/medio-pago-guardado.entity';
import { WompiClientService } from '../pagos/wompi-client.service';
import { PaquetesService } from '../paquetes/paquetes.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

describe('SuscripcionesService — creación y estaBloqueado', () => {
  let service: SuscripcionesService;
  let suscripcionesRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    suscripcionesRepo = { findOne: jest.fn(), create: jest.fn((x) => x), save: jest.fn(async (x) => x) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionesService,
        { provide: getRepositoryToken(Suscripcion), useValue: suscripcionesRepo },
        { provide: getRepositoryToken(TransaccionSuscripcion), useValue: {} },
        { provide: getRepositoryToken(MedioPagoGuardado), useValue: {} },
        { provide: WompiClientService, useValue: {} },
        { provide: PaquetesService, useValue: {} },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(SuscripcionesService);
  });

  it('crearSuscripcionPrueba pone fechaFin 20 días después de fechaInicio', async () => {
    await service.crearSuscripcionPrueba('neg-1', 'pro-1');
    const guardado = suscripcionesRepo.save.mock.calls[0][0] as Suscripcion;
    expect(guardado.estado).toBe(EstadoSuscripcion.PRUEBA);
    const diffDias = (guardado.fechaFin!.getTime() - guardado.fechaInicio.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDias).toBeCloseTo(20, 1);
  });

  it('crearSuscripcionSinVencimiento crea en ACTIVA con fechaFin null', async () => {
    await service.crearSuscripcionSinVencimiento('neg-1', 'free-1');
    const guardado = suscripcionesRepo.save.mock.calls[0][0] as Suscripcion;
    expect(guardado.estado).toBe(EstadoSuscripcion.ACTIVA);
    expect(guardado.fechaFin).toBeNull();
  });

  describe('estaBloqueado', () => {
    it('true si no hay ninguna Suscripcion para el negocio (fail-closed)', async () => {
      suscripcionesRepo.findOne.mockResolvedValue(null);
      expect(await service.estaBloqueado('neg-sin-suscripcion')).toBe(true);
    });

    it('true si el estado es VENCIDA', async () => {
      suscripcionesRepo.findOne.mockResolvedValue({ estado: EstadoSuscripcion.VENCIDA, fechaFin: null });
      expect(await service.estaBloqueado('neg-1')).toBe(true);
    });

    it('false si el estado es PRUEBA o ACTIVA con fechaFin futura (o sin vencimiento)', async () => {
      const fechaFutura = new Date(Date.now() + 24 * 60 * 60 * 1000);
      suscripcionesRepo.findOne.mockResolvedValue({ estado: EstadoSuscripcion.PRUEBA, fechaFin: fechaFutura });
      expect(await service.estaBloqueado('neg-1')).toBe(false);
      suscripcionesRepo.findOne.mockResolvedValue({ estado: EstadoSuscripcion.ACTIVA, fechaFin: null });
      expect(await service.estaBloqueado('neg-1')).toBe(false);
    });

    it('true si estado es PRUEBA/ACTIVA pero fechaFin ya pasó — no depende de que el cron haya corrido', async () => {
      const fechaPasada = new Date(Date.now() - 24 * 60 * 60 * 1000);
      suscripcionesRepo.findOne.mockResolvedValue({ estado: EstadoSuscripcion.PRUEBA, fechaFin: fechaPasada });
      expect(await service.estaBloqueado('neg-1')).toBe(true);
      suscripcionesRepo.findOne.mockResolvedValue({ estado: EstadoSuscripcion.ACTIVA, fechaFin: fechaPasada });
      expect(await service.estaBloqueado('neg-1')).toBe(true);
    });
  });
});

describe('SuscripcionesService — iniciarReactivacion con guardarTarjeta', () => {
  it('crea la fuente de pago y guarda el medio de pago cuando la transacción se aprueba', async () => {
    const suscripcionesRepo = {
      findOne: jest.fn().mockResolvedValue({ negocioId: 'neg-1', paqueteId: 'pro-1', estado: 'VENCIDA' }),
      save: jest.fn(async (x: unknown) => x),
    };
    const paquetesService = { findOne: jest.fn().mockResolvedValue({ id: 'pro-1', precioMensual: 139900, nombre: 'Profesional' }) };
    const wompiClient = {
      obtenerTokensAceptacion: jest.fn().mockResolvedValue({ acceptanceToken: 'acc', acceptPersonalAuth: 'auth' }),
      crearFuentePago: jest.fn().mockResolvedValue({ paymentSourceId: 3891 }),
      crearTransaccionConFuente: jest.fn().mockResolvedValue({ wompiTransactionId: 'txn-1', status: 'APPROVED' }),
    };
    const medioPagoRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((x: unknown) => x), save: jest.fn(async (x: unknown) => x) };
    const sinPendientesQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionesService,
        { provide: getRepositoryToken(Suscripcion), useValue: suscripcionesRepo },
        {
          provide: getRepositoryToken(TransaccionSuscripcion),
          useValue: {
            save: jest.fn(async (x: unknown) => x),
            create: jest.fn((x: unknown) => x),
            createQueryBuilder: jest.fn(() => sinPendientesQueryBuilder),
          },
        },
        { provide: getRepositoryToken(MedioPagoGuardado), useValue: medioPagoRepo },
        { provide: WompiClientService, useValue: wompiClient },
        { provide: PaquetesService, useValue: paquetesService },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
      ],
    }).compile();

    const service = moduleRef.get(SuscripcionesService);
    await service.iniciarReactivacion('neg-1', {
      metodo: 'TARJETA',
      datosMetodo: { token: 'tok_1' },
      guardarTarjeta: true,
      ultimosCuatroDigitos: '4242',
    });

    expect(wompiClient.crearFuentePago).toHaveBeenCalled();
    expect(medioPagoRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ negocioId: 'neg-1', wompiPaymentSourceId: 3891, ultimosCuatroDigitos: '4242' }),
    );
  });
});

describe('SuscripcionesService — cobrarAutomatico', () => {
  let service: SuscripcionesService;
  let suscripcionesRepo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let medioPagoRepo: { find: jest.Mock; findOne: jest.Mock };
  let wompiClient: { crearTransaccionConFuente: jest.Mock };

  beforeEach(async () => {
    suscripcionesRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn(async (x: unknown) => x) };
    medioPagoRepo = { find: jest.fn(), findOne: jest.fn() };
    wompiClient = { crearTransaccionConFuente: jest.fn() };
    const paquetesService = { findOne: jest.fn().mockResolvedValue({ id: 'pro-1', precioMensual: 139900, nombre: 'Profesional' }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionesService,
        { provide: getRepositoryToken(Suscripcion), useValue: suscripcionesRepo },
        { provide: getRepositoryToken(TransaccionSuscripcion), useValue: { save: jest.fn(async (x: unknown) => x), create: jest.fn((x: unknown) => x) } },
        { provide: getRepositoryToken(MedioPagoGuardado), useValue: medioPagoRepo },
        { provide: WompiClientService, useValue: wompiClient },
        { provide: PaquetesService, useValue: paquetesService },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(SuscripcionesService);
  });

  it('cobro exitoso resetea intentosFallidosCobro y extiende fechaFin', async () => {
    const suscripcionVencida = {
      id: 'sus-1', negocioId: 'neg-1', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 1,
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcionVencida]);
    suscripcionesRepo.findOne.mockResolvedValue(suscripcionVencida);
    medioPagoRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', wompiPaymentSourceId: 3891, activo: true });

    wompiClient.crearTransaccionConFuente.mockResolvedValue({ wompiTransactionId: 'txn-2', status: 'APPROVED' });

    await service.cobrarAutomatico();

    const guardado = suscripcionesRepo.save.mock.calls.at(-1)![0];
    expect(guardado.estado).toBe('ACTIVA');
    expect(guardado.fechaFin.getTime()).toBeGreaterThan(Date.now());
  });

  it('al tercer fallo consecutivo marca VENCIDA', async () => {
    const suscripcionVencida = {
      id: 'sus-1', negocioId: 'neg-1', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 2,
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcionVencida]);
    suscripcionesRepo.findOne.mockResolvedValue(suscripcionVencida);
    medioPagoRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', wompiPaymentSourceId: 3891, activo: true });
    wompiClient.crearTransaccionConFuente.mockResolvedValue({ wompiTransactionId: 'txn-3', status: 'DECLINED' });

    await service.cobrarAutomatico();

    const guardado = suscripcionesRepo.save.mock.calls.at(-1)![0];
    expect(guardado.intentosFallidosCobro).toBe(3);
    expect(guardado.estado).toBe('VENCIDA');
  });

  it('sin medio de pago activo no intenta cobrar', async () => {
    const suscripcionVencida = {
      id: 'sus-1', negocioId: 'neg-1', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 0,
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcionVencida]);
    medioPagoRepo.findOne.mockResolvedValue(null);

    await service.cobrarAutomatico();

    expect(wompiClient.crearTransaccionConFuente).not.toHaveBeenCalled();
  });
});
