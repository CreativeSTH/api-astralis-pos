import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { SuscripcionesService } from './suscripciones.service';
import { Suscripcion } from './entities/suscripcion.entity';
import { EstadoSuscripcion } from './entities/estado-suscripcion.enum';
import { TransaccionSuscripcion } from './entities/transaccion-suscripcion.entity';
import { MedioPagoGuardado } from './entities/medio-pago-guardado.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Alerta } from '../alertas/entities/alerta.entity';
import { WompiClientService } from '../pagos/wompi-client.service';
import { PaquetesService } from '../paquetes/paquetes.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { EmailService } from '../email/email.service';

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
        { provide: getRepositoryToken(Negocio), useValue: {} },
        { provide: getRepositoryToken(Usuario), useValue: {} },
        { provide: getRepositoryToken(Alerta), useValue: {} },
        { provide: EmailService, useValue: { enviar: jest.fn() } },
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
        { provide: getRepositoryToken(Negocio), useValue: {} },
        { provide: getRepositoryToken(Usuario), useValue: {} },
        { provide: getRepositoryToken(Alerta), useValue: {} },
        { provide: EmailService, useValue: { enviar: jest.fn() } },
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
  let sinIntentoHoyQueryBuilder: { where: jest.Mock; andWhere: jest.Mock; getOne: jest.Mock };

  beforeEach(async () => {
    suscripcionesRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn(async (x: unknown) => x) };
    medioPagoRepo = { find: jest.fn(), findOne: jest.fn() };
    wompiClient = { crearTransaccionConFuente: jest.fn() };
    sinIntentoHoyQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const paquetesService = { findOne: jest.fn().mockResolvedValue({ id: 'pro-1', precioMensual: 139900, nombre: 'Profesional' }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionesService,
        { provide: getRepositoryToken(Suscripcion), useValue: suscripcionesRepo },
        {
          provide: getRepositoryToken(TransaccionSuscripcion),
          useValue: {
            save: jest.fn(async (x: unknown) => x),
            create: jest.fn((x: unknown) => x),
            createQueryBuilder: jest.fn(() => sinIntentoHoyQueryBuilder),
          },
        },
        { provide: getRepositoryToken(MedioPagoGuardado), useValue: medioPagoRepo },
        { provide: WompiClientService, useValue: wompiClient },
        { provide: PaquetesService, useValue: paquetesService },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
        { provide: getRepositoryToken(Negocio), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(Usuario), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(Alerta), useValue: {} },
        { provide: EmailService, useValue: { enviar: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(SuscripcionesService);
  });

  it('cobro exitoso resetea intentosFallidosCobro, recordatoriosEnviados y extiende fechaFin', async () => {
    const suscripcionVencida = {
      id: 'sus-1', negocioId: 'neg-1', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 1,
      recordatoriosEnviados: ['DIA_-2', 'DIA_-1', 'DIA_0'],
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcionVencida]);
    suscripcionesRepo.findOne.mockResolvedValue(suscripcionVencida);
    medioPagoRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', wompiPaymentSourceId: 3891, activo: true });

    wompiClient.crearTransaccionConFuente.mockResolvedValue({ wompiTransactionId: 'txn-2', status: 'APPROVED' });

    await service.cobrarAutomatico();

    const guardado = suscripcionesRepo.save.mock.calls.at(-1)![0];
    expect(guardado.estado).toBe('ACTIVA');
    expect(guardado.fechaFin.getTime()).toBeGreaterThan(Date.now());
    expect(guardado.recordatoriosEnviados).toEqual([]);
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

  it('un status PENDING (confirmado real contra el sandbox de Wompi: así responde un cobro con payment_source) NO cuenta como fallo inmediato', async () => {
    const suscripcionVencida = {
      id: 'sus-1', negocioId: 'neg-1', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 0,
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcionVencida]);
    medioPagoRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', wompiPaymentSourceId: 3891, activo: true });
    wompiClient.crearTransaccionConFuente.mockResolvedValue({ wompiTransactionId: 'txn-4', status: 'PENDING' });

    await service.cobrarAutomatico();

    expect(suscripcionesRepo.save).not.toHaveBeenCalled();
    expect(suscripcionVencida.intentosFallidosCobro).toBe(0);
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

  it('no cobra dos veces si ya hay un intento automático reciente (protege contra un cron reiniciado el mismo día)', async () => {
    const suscripcionVencida = {
      id: 'sus-1', negocioId: 'neg-1', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 0,
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcionVencida]);
    medioPagoRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', wompiPaymentSourceId: 3891, activo: true });
    sinIntentoHoyQueryBuilder.getOne.mockResolvedValue({ id: 'txn-previa' });

    await service.cobrarAutomatico();

    expect(wompiClient.crearTransaccionConFuente).not.toHaveBeenCalled();
  });

  it('un error ANTES de llamar a Wompi (ej. falla la consulta de medio de pago) también cuenta como intento fallido y no corta la corrida', async () => {
    const suscripcionConError = {
      id: 'sus-1', negocioId: 'neg-error', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 0,
    };
    const suscripcionSiguiente = {
      id: 'sus-2', negocioId: 'neg-2', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 0,
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcionConError, suscripcionSiguiente]);
    medioPagoRepo.findOne
      .mockRejectedValueOnce(new Error('DB caída'))
      .mockResolvedValueOnce({ negocioId: 'neg-2', wompiPaymentSourceId: 3891, activo: true });
    suscripcionesRepo.findOne.mockImplementation(async ({ where }: { where: { negocioId: string } }) =>
      where.negocioId === 'neg-error' ? suscripcionConError : suscripcionSiguiente,
    );
    wompiClient.crearTransaccionConFuente.mockResolvedValue({ wompiTransactionId: 'txn-2', status: 'APPROVED' });

    await service.cobrarAutomatico();

    expect(suscripcionConError.intentosFallidosCobro).toBe(1);
    expect(wompiClient.crearTransaccionConFuente).toHaveBeenCalledTimes(1);
  });

  it('un error cobrando a un negocio no corta la corrida ni lo deja sin contar como intento fallido', async () => {
    const suscripcionConError = {
      id: 'sus-1', negocioId: 'neg-error', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 0,
    };
    const suscripcionSiguiente = {
      id: 'sus-2', negocioId: 'neg-2', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 0,
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcionConError, suscripcionSiguiente]);
    medioPagoRepo.findOne.mockResolvedValue({ negocioId: 'neg-x', wompiPaymentSourceId: 3891, activo: true });
    suscripcionesRepo.findOne.mockImplementation(async ({ where }: { where: { negocioId: string } }) =>
      where.negocioId === 'neg-error' ? suscripcionConError : suscripcionSiguiente,
    );
    wompiClient.crearTransaccionConFuente
      .mockRejectedValueOnce(new Error('Wompi caído'))
      .mockResolvedValueOnce({ wompiTransactionId: 'txn-2', status: 'APPROVED' });

    await service.cobrarAutomatico();

    expect(wompiClient.crearTransaccionConFuente).toHaveBeenCalledTimes(2);
    expect(suscripcionConError.intentosFallidosCobro).toBe(1);
  });
});

describe('SuscripcionesService — aviso de cobro fallido', () => {
  async function crearServicio(overrides: { alertaExistente?: unknown } = {}) {
    const suscripcionesRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn(async (x: unknown) => x) };
    const medioPagoRepo = { findOne: jest.fn() };
    const wompiClient = { crearTransaccionConFuente: jest.fn() };
    const sinIntentoHoyQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const paquetesService = { findOne: jest.fn().mockResolvedValue({ id: 'pro-1', precioMensual: 139900, nombre: 'Profesional' }) };
    const negociosRepo = { findOne: jest.fn().mockResolvedValue({ id: 'neg-1' }) };
    const usuariosRepo = { findOne: jest.fn().mockResolvedValue({ email: 'admin@negocio.com' }) };
    const alertasRepo = {
      findOne: jest.fn().mockResolvedValue(overrides.alertaExistente ?? null),
      create: jest.fn((x: unknown) => x),
      save: jest.fn(async (x: unknown) => x),
    };
    const emailService = { enviar: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionesService,
        { provide: getRepositoryToken(Suscripcion), useValue: suscripcionesRepo },
        {
          provide: getRepositoryToken(TransaccionSuscripcion),
          useValue: {
            save: jest.fn(async (x: unknown) => x),
            create: jest.fn((x: unknown) => x),
            createQueryBuilder: jest.fn(() => sinIntentoHoyQueryBuilder),
          },
        },
        { provide: getRepositoryToken(MedioPagoGuardado), useValue: medioPagoRepo },
        { provide: WompiClientService, useValue: wompiClient },
        { provide: PaquetesService, useValue: paquetesService },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
        { provide: getRepositoryToken(Negocio), useValue: negociosRepo },
        { provide: getRepositoryToken(Usuario), useValue: usuariosRepo },
        { provide: getRepositoryToken(Alerta), useValue: alertasRepo },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    return { service: moduleRef.get(SuscripcionesService), suscripcionesRepo, medioPagoRepo, wompiClient, emailService, alertasRepo, paquetesService };
  }

  it('avisa por correo y alerta en cada fallo, con tono distinto en el 3er intento', async () => {
    const { service, suscripcionesRepo, medioPagoRepo, wompiClient, emailService } = await crearServicio();
    const suscripcion = {
      id: 'sus-1', negocioId: 'neg-1', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 2,
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcion]);
    suscripcionesRepo.findOne.mockResolvedValue(suscripcion);
    medioPagoRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', wompiPaymentSourceId: 3891, activo: true });
    wompiClient.crearTransaccionConFuente.mockResolvedValue({ wompiTransactionId: 'txn-x', status: 'DECLINED' });

    await service.cobrarAutomatico();

    expect(emailService.enviar).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('bloqueada') }),
    );
  });

  it('en el primer/segundo fallo el correo tiene tono de reintento, no de bloqueo', async () => {
    const { service, suscripcionesRepo, medioPagoRepo, wompiClient, emailService } = await crearServicio();
    const suscripcion = {
      id: 'sus-1', negocioId: 'neg-1', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 0,
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcion]);
    suscripcionesRepo.findOne.mockResolvedValue(suscripcion);
    medioPagoRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', wompiPaymentSourceId: 3891, activo: true });
    wompiClient.crearTransaccionConFuente.mockResolvedValue({ wompiTransactionId: 'txn-x', status: 'DECLINED' });

    await service.cobrarAutomatico();

    expect(emailService.enviar).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'No pudimos cobrar tu tarjeta' }),
    );
  });

  it('no duplica la alerta si ya existe una activa del mismo tipo+referencia', async () => {
    const { service, suscripcionesRepo, medioPagoRepo, wompiClient, alertasRepo } = await crearServicio({
      alertaExistente: { id: 'alerta-1', negocioId: 'neg-1', tipo: 'SUSCRIPCION_COBRO_FALLIDO', referenciaId: 'sus-1', resuelta: false },
    });
    const suscripcion = {
      id: 'sus-1', negocioId: 'neg-1', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 0,
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcion]);
    suscripcionesRepo.findOne.mockResolvedValue(suscripcion);
    medioPagoRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', wompiPaymentSourceId: 3891, activo: true });
    wompiClient.crearTransaccionConFuente.mockResolvedValue({ wompiTransactionId: 'txn-x', status: 'DECLINED' });

    await service.cobrarAutomatico();

    expect(alertasRepo.create).not.toHaveBeenCalled();
    expect(alertasRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'alerta-1' }));
  });

  it('si falla el aviso mismo (ej. el paquete fue borrado) no se escapa del catch de cobrarAutomatico ni corta la corrida', async () => {
    const { service, suscripcionesRepo, medioPagoRepo, wompiClient, paquetesService } = await crearServicio();
    const suscripcionConError = {
      id: 'sus-1', negocioId: 'neg-error', paqueteId: 'pro-borrado',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 0,
    };
    const suscripcionSiguiente = {
      id: 'sus-2', negocioId: 'neg-2', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: new Date(Date.now() - 86400000), intentosFallidosCobro: 0,
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcionConError, suscripcionSiguiente]);
    suscripcionesRepo.findOne.mockImplementation(async ({ where }: { where: { negocioId: string } }) =>
      where.negocioId === 'neg-error' ? suscripcionConError : suscripcionSiguiente,
    );
    medioPagoRepo.findOne.mockResolvedValue({ negocioId: 'neg-x', wompiPaymentSourceId: 3891, activo: true });
    // El cobro en sí falla (DECLINED) para ambos negocios. `paquetesService.findOne` se llama DOS
    // veces por negocio con DECLINED: una dentro del cuerpo principal de cobrarAutomatico (arma el
    // monto a cobrar) y otra dentro de registrarIntentoFallido (arma el correo de aviso) — acá se
    // hace fallar específicamente la SEGUNDA llamada del primer negocio, reproduciendo el hallazgo
    // real de la revisión: el paquete se borró justo entre que se armó el cobro y se armó el aviso.
    wompiClient.crearTransaccionConFuente.mockResolvedValue({ wompiTransactionId: 'txn-x', status: 'DECLINED' });
    paquetesService.findOne
      .mockResolvedValueOnce({ id: 'pro-borrado', nombre: 'Profesional', precioMensual: 139900 })
      .mockRejectedValueOnce(new Error('Paquete pro-borrado no encontrado'));

    await service.cobrarAutomatico();

    expect(suscripcionConError.intentosFallidosCobro).toBe(1);
    expect(suscripcionSiguiente.intentosFallidosCobro).toBe(1);
    expect(wompiClient.crearTransaccionConFuente).toHaveBeenCalledTimes(2);
  });
});

describe('SuscripcionesService — marcarVencidas', () => {
  it('excluye de la actualización a los negocios con medio de pago activo', async () => {
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const suscripcionesRepo = { createQueryBuilder: jest.fn(() => queryBuilder) };
    const medioPagoRepo = { find: jest.fn().mockResolvedValue([{ negocioId: 'neg-con-tarjeta', activo: true }]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionesService,
        { provide: getRepositoryToken(Suscripcion), useValue: suscripcionesRepo },
        { provide: getRepositoryToken(TransaccionSuscripcion), useValue: {} },
        { provide: getRepositoryToken(MedioPagoGuardado), useValue: medioPagoRepo },
        { provide: WompiClientService, useValue: {} },
        { provide: PaquetesService, useValue: {} },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
        { provide: getRepositoryToken(Negocio), useValue: {} },
        { provide: getRepositoryToken(Usuario), useValue: {} },
        { provide: getRepositoryToken(Alerta), useValue: {} },
        { provide: EmailService, useValue: { enviar: jest.fn() } },
      ],
    }).compile();

    const service = moduleRef.get(SuscripcionesService);
    await service.marcarVencidas();

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'negocio_id NOT IN (:...idsExcluidos)',
      { idsExcluidos: ['neg-con-tarjeta'] },
    );
  });

  it('no agrega el filtro de exclusión si nadie tiene medio de pago activo', async () => {
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const suscripcionesRepo = { createQueryBuilder: jest.fn(() => queryBuilder) };
    const medioPagoRepo = { find: jest.fn().mockResolvedValue([]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionesService,
        { provide: getRepositoryToken(Suscripcion), useValue: suscripcionesRepo },
        { provide: getRepositoryToken(TransaccionSuscripcion), useValue: {} },
        { provide: getRepositoryToken(MedioPagoGuardado), useValue: medioPagoRepo },
        { provide: WompiClientService, useValue: {} },
        { provide: PaquetesService, useValue: {} },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
        { provide: getRepositoryToken(Negocio), useValue: {} },
        { provide: getRepositoryToken(Usuario), useValue: {} },
        { provide: getRepositoryToken(Alerta), useValue: {} },
        { provide: EmailService, useValue: { enviar: jest.fn() } },
      ],
    }).compile();

    const service = moduleRef.get(SuscripcionesService);
    await service.marcarVencidas();

    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(1);
  });
});

describe('SuscripcionesService — procesarWebhookWompi cuenta el fallo de un cobro AUTOMATICO', () => {
  const SECRETO = 'secreto-test';
  const OLD_ENV = process.env.WOMPI_PLATAFORMA_LLAVE_SECRETA_EVENTOS;

  beforeEach(() => {
    process.env.WOMPI_PLATAFORMA_LLAVE_SECRETA_EVENTOS = SECRETO;
  });

  afterAll(() => {
    process.env.WOMPI_PLATAFORMA_LLAVE_SECRETA_EVENTOS = OLD_ENV;
  });

  function payloadPara(status: 'APPROVED' | 'DECLINED', transactionId: string) {
    const timestamp = 1234567890;
    const valores = [transactionId, status].join('');
    const checksum = createHash('sha256').update(valores + timestamp + SECRETO).digest('hex');
    return {
      event: 'transaction.updated',
      data: { transaction: { id: transactionId, reference: 'ref-auto-1', status } },
      signature: { properties: ['transaction.id', 'transaction.status'], checksum },
      timestamp,
    };
  }

  it('un DECLINED confirmado por webhook sobre una transacción origen=AUTOMATICO incrementa intentosFallidosCobro', async () => {
    const transaccion = {
      id: 'txn-1', negocioId: 'neg-1', paqueteId: 'pro-1', referencia: 'ref-auto-1',
      wompiTransactionId: 'wtx-1', estado: 'PENDIENTE', origen: 'AUTOMATICO',
    };
    const suscripcion = { negocioId: 'neg-1', intentosFallidosCobro: 0 };
    const transaccionesRepo = { findOne: jest.fn().mockResolvedValue(transaccion), save: jest.fn(async (x: unknown) => x) };
    const suscripcionesRepo = { findOne: jest.fn().mockResolvedValue(suscripcion), save: jest.fn(async (x: unknown) => x) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionesService,
        { provide: getRepositoryToken(Suscripcion), useValue: suscripcionesRepo },
        { provide: getRepositoryToken(TransaccionSuscripcion), useValue: transaccionesRepo },
        { provide: getRepositoryToken(MedioPagoGuardado), useValue: {} },
        { provide: WompiClientService, useValue: {} },
        { provide: PaquetesService, useValue: {} },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
        { provide: getRepositoryToken(Negocio), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(Usuario), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(Alerta), useValue: {} },
        { provide: EmailService, useValue: { enviar: jest.fn() } },
      ],
    }).compile();

    const service = moduleRef.get(SuscripcionesService);
    await service.procesarWebhookWompi(payloadPara('DECLINED', 'wtx-1'));

    expect(suscripcion.intentosFallidosCobro).toBe(1);
  });

  it('un DECLINED sobre una transacción origen=MANUAL no toca intentosFallidosCobro', async () => {
    const transaccion = {
      id: 'txn-1', negocioId: 'neg-1', paqueteId: 'pro-1', referencia: 'ref-auto-1',
      wompiTransactionId: 'wtx-1', estado: 'PENDIENTE', origen: 'MANUAL',
    };
    const suscripcionesRepo = { findOne: jest.fn(), save: jest.fn(async (x: unknown) => x) };
    const transaccionesRepo = { findOne: jest.fn().mockResolvedValue(transaccion), save: jest.fn(async (x: unknown) => x) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionesService,
        { provide: getRepositoryToken(Suscripcion), useValue: suscripcionesRepo },
        { provide: getRepositoryToken(TransaccionSuscripcion), useValue: transaccionesRepo },
        { provide: getRepositoryToken(MedioPagoGuardado), useValue: {} },
        { provide: WompiClientService, useValue: {} },
        { provide: PaquetesService, useValue: {} },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
        { provide: getRepositoryToken(Negocio), useValue: {} },
        { provide: getRepositoryToken(Usuario), useValue: {} },
        { provide: getRepositoryToken(Alerta), useValue: {} },
        { provide: EmailService, useValue: { enviar: jest.fn() } },
      ],
    }).compile();

    const service = moduleRef.get(SuscripcionesService);
    await service.procesarWebhookWompi(payloadPara('DECLINED', 'wtx-1'));

    expect(suscripcionesRepo.findOne).not.toHaveBeenCalled();
  });
});

describe('SuscripcionesService — reconciliarPendientes cuenta el fallo de un cobro AUTOMATICO', () => {
  it('un DECLINED confirmado por polling sobre una transacción origen=AUTOMATICO incrementa intentosFallidosCobro', async () => {
    const transaccionPendiente = {
      id: 'txn-1', negocioId: 'neg-1', paqueteId: 'pro-1', referencia: 'ref-auto-1',
      wompiTransactionId: 'wtx-1', estado: 'PENDIENTE', origen: 'AUTOMATICO', createdAt: new Date(),
    };
    const suscripcion = { negocioId: 'neg-1', intentosFallidosCobro: 0 };
    const transaccionesRepo = {
      find: jest.fn().mockResolvedValue([transaccionPendiente]),
      findOne: jest.fn().mockResolvedValue(transaccionPendiente),
      save: jest.fn(async (x: unknown) => x),
    };
    const suscripcionesRepo = { findOne: jest.fn().mockResolvedValue(suscripcion), save: jest.fn(async (x: unknown) => x) };
    const wompiClient = { obtenerTransaccion: jest.fn().mockResolvedValue({ status: 'DECLINED' }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionesService,
        { provide: getRepositoryToken(Suscripcion), useValue: suscripcionesRepo },
        { provide: getRepositoryToken(TransaccionSuscripcion), useValue: transaccionesRepo },
        { provide: getRepositoryToken(MedioPagoGuardado), useValue: {} },
        { provide: WompiClientService, useValue: wompiClient },
        { provide: PaquetesService, useValue: {} },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
        { provide: getRepositoryToken(Negocio), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(Usuario), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(Alerta), useValue: {} },
        { provide: EmailService, useValue: { enviar: jest.fn() } },
      ],
    }).compile();

    const service = moduleRef.get(SuscripcionesService);
    await service.reconciliarPendientes();

    expect(suscripcion.intentosFallidosCobro).toBe(1);
  });
});

describe('SuscripcionesService — enviarRecordatorios', () => {
  const enDias = (n: number) => new Date(Date.now() + n * 86400000);

  let service: SuscripcionesService;
  let suscripcionesRepo: { find: jest.Mock; save: jest.Mock };
  let negociosRepo: { findOne: jest.Mock };
  let usuariosRepo: { findOne: jest.Mock };
  let medioPagoRepo: { findOne: jest.Mock };
  let alertasRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let emailService: { enviar: jest.Mock };
  let paquetesService: { findOne: jest.Mock };

  beforeEach(async () => {
    suscripcionesRepo = { find: jest.fn(), save: jest.fn(async (x: unknown) => x) };
    negociosRepo = { findOne: jest.fn().mockResolvedValue({ id: 'neg-1' }) };
    usuariosRepo = { findOne: jest.fn().mockResolvedValue({ email: 'admin@negocio.com' }) };
    medioPagoRepo = { findOne: jest.fn().mockResolvedValue(null) };
    alertasRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((x: unknown) => x), save: jest.fn(async (x: unknown) => x) };
    emailService = { enviar: jest.fn() };
    paquetesService = { findOne: jest.fn().mockResolvedValue({ id: 'pro-1', nombre: 'Profesional', precioMensual: 139900 }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionesService,
        { provide: getRepositoryToken(Suscripcion), useValue: suscripcionesRepo },
        { provide: getRepositoryToken(TransaccionSuscripcion), useValue: {} },
        { provide: getRepositoryToken(MedioPagoGuardado), useValue: medioPagoRepo },
        { provide: getRepositoryToken(Negocio), useValue: negociosRepo },
        { provide: getRepositoryToken(Usuario), useValue: usuariosRepo },
        { provide: getRepositoryToken(Alerta), useValue: alertasRepo },
        { provide: WompiClientService, useValue: {} },
        { provide: PaquetesService, useValue: paquetesService },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = moduleRef.get(SuscripcionesService);
  });

  it('envía el recordatorio de día -2 y lo marca en recordatoriosEnviados', async () => {
    const suscripcion = {
      id: 'sus-1', negocioId: 'neg-1', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: enDias(2), recordatoriosEnviados: [],
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcion]);

    await service.enviarRecordatorios();

    expect(emailService.enviar).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@negocio.com' }));
    const guardado = suscripcionesRepo.save.mock.calls.at(-1)![0];
    expect(guardado.recordatoriosEnviados).toContain('DIA_-2');
  });

  it('no reenvía un recordatorio ya marcado', async () => {
    const suscripcion = {
      id: 'sus-1', negocioId: 'neg-1', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: enDias(2), recordatoriosEnviados: ['DIA_-2'],
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcion]);

    await service.enviarRecordatorios();

    expect(emailService.enviar).not.toHaveBeenCalled();
    expect(suscripcionesRepo.save).not.toHaveBeenCalled();
  });

  it('envía el recordatorio de día 0 con tono de auto-débito cuando hay MedioPagoGuardado activo', async () => {
    const suscripcion = {
      id: 'sus-1', negocioId: 'neg-1', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: enDias(0), recordatoriosEnviados: [],
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcion]);
    medioPagoRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', ultimosCuatroDigitos: '4242', activo: true });

    await service.enviarRecordatorios();

    expect(emailService.enviar).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('Hoy te cobramos') }),
    );
    const guardado = suscripcionesRepo.save.mock.calls.at(-1)![0];
    expect(guardado.recordatoriosEnviados).toContain('DIA_0');
  });

  it('no manda nada si fechaFin no está a 2, 1 o 0 días', async () => {
    const suscripcion = {
      id: 'sus-1', negocioId: 'neg-1', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: enDias(5), recordatoriosEnviados: [],
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcion]);

    await service.enviarRecordatorios();

    expect(emailService.enviar).not.toHaveBeenCalled();
  });

  it('un error en un negocio no corta la corrida de recordatorios para el resto', async () => {
    const suscripcionConError = {
      id: 'sus-1', negocioId: 'neg-error', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: enDias(2), recordatoriosEnviados: [],
    };
    const suscripcionSiguiente = {
      id: 'sus-2', negocioId: 'neg-2', paqueteId: 'pro-1',
      estado: 'ACTIVA', fechaFin: enDias(2), recordatoriosEnviados: [],
    };
    suscripcionesRepo.find.mockResolvedValue([suscripcionConError, suscripcionSiguiente]);
    paquetesService.findOne
      .mockRejectedValueOnce(new Error('Paquete borrado'))
      .mockResolvedValueOnce({ id: 'pro-1', nombre: 'Profesional', precioMensual: 139900 });

    await service.enviarRecordatorios();

    expect(emailService.enviar).toHaveBeenCalledTimes(1);
  });
});

describe('SuscripcionesService — gating por feature y cupo/consumo', () => {
  let service: SuscripcionesService;
  let suscripcionesRepo: { findOne: jest.Mock; findOneOrFail: jest.Mock; save: jest.Mock };
  let paquetesService: { findOne: jest.Mock };

  beforeEach(async () => {
    suscripcionesRepo = { findOne: jest.fn(), findOneOrFail: jest.fn(), save: jest.fn(async (x) => x) };
    paquetesService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'pro-1',
        nombre: 'Profesional',
        facturacionDianHabilitada: true,
        documentosDianPorMes: 12000,
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionesService,
        { provide: getRepositoryToken(Suscripcion), useValue: suscripcionesRepo },
        { provide: getRepositoryToken(TransaccionSuscripcion), useValue: {} },
        { provide: getRepositoryToken(MedioPagoGuardado), useValue: {} },
        { provide: WompiClientService, useValue: {} },
        { provide: PaquetesService, useValue: paquetesService },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
        { provide: getRepositoryToken(Negocio), useValue: {} },
        { provide: getRepositoryToken(Usuario), useValue: {} },
        { provide: getRepositoryToken(Alerta), useValue: {} },
        { provide: EmailService, useValue: { enviar: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(SuscripcionesService);
  });

  it('tieneFeature true cuando el paquete tiene la feature booleana activa', async () => {
    suscripcionesRepo.findOneOrFail.mockResolvedValue({ negocioId: 'neg-1', paqueteId: 'pro-1' });
    await expect(service.tieneFeature('neg-1', 'facturacionDianHabilitada')).resolves.toBe(true);
  });

  it('tieneFeature false cuando el paquete no la tiene', async () => {
    paquetesService.findOne.mockResolvedValue({ id: 'free-1', facturacionDianHabilitada: false });
    suscripcionesRepo.findOneOrFail.mockResolvedValue({ negocioId: 'neg-1', paqueteId: 'free-1' });
    await expect(service.tieneFeature('neg-1', 'facturacionDianHabilitada')).resolves.toBe(false);
  });

  it('obtenerCupoYConsumo devuelve consumo 0 si el mes de referencia no es el actual', async () => {
    suscripcionesRepo.findOneOrFail.mockResolvedValue({
      negocioId: 'neg-1',
      paqueteId: 'pro-1',
      consumoMensual: { documentosDianPorMes: 999 },
      consumoMesReferencia: '2020-01',
    });
    const resultado = await service.obtenerCupoYConsumo('neg-1', 'documentosDianPorMes');
    expect(resultado).toEqual({ cupo: 12000, consumo: 0 });
  });

  it('registrarConsumo incrementa el contador del mes actual', async () => {
    const mesActual = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    suscripcionesRepo.findOneOrFail.mockResolvedValue({
      negocioId: 'neg-1',
      consumoMensual: { documentosDianPorMes: 3 },
      consumoMesReferencia: mesActual,
    });

    await service.registrarConsumo('neg-1', 'documentosDianPorMes');

    const guardado = suscripcionesRepo.save.mock.calls[0][0];
    expect(guardado.consumoMensual.documentosDianPorMes).toBe(4);
  });

  it('registrarConsumo resetea el contador si el mes de referencia cambió', async () => {
    suscripcionesRepo.findOneOrFail.mockResolvedValue({
      negocioId: 'neg-1',
      consumoMensual: { documentosDianPorMes: 999 },
      consumoMesReferencia: '2020-01',
    });

    await service.registrarConsumo('neg-1', 'documentosDianPorMes');

    const guardado = suscripcionesRepo.save.mock.calls[0][0];
    expect(guardado.consumoMensual.documentosDianPorMes).toBe(1);
  });
});
