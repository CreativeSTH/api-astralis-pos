import { createHash } from 'crypto';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PagosService } from './pagos.service';
import { ConfiguracionPagoWompi } from './entities/configuracion-pago-wompi.entity';
import { TransaccionPago } from './entities/transaccion-pago.entity';
import { WompiClientService } from './wompi-client.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MetodosPagoService } from '../metodos-pago/metodos-pago.service';
import { encriptar } from '../common/utils/cifrado';

// El checksum de Wompi es SHA256 simple sobre valores concatenados + timestamp + secreto (no HMAC).
function firmarEvento(
  properties: string[],
  data: any,
  timestamp: number,
  secreto: string,
): string {
  const valores = properties.map((p) => {
    const [entidad, campo] = p.split('.');
    return data[entidad][campo];
  });
  const cadena = valores.join('') + timestamp + secreto;
  return createHash('sha256').update(cadena).digest('hex');
}

describe('PagosService — configuración', () => {
  let service: PagosService;
  let repo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let metodosPagoService: { asegurarMetodo: jest.Mock };

  beforeAll(() => {
    process.env.CIFRADO_CLAVE_MAESTRA =
      '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
  });

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn((x: ConfiguracionPagoWompi) => x),
      create: jest.fn((x: Partial<ConfiguracionPagoWompi>) => x),
    };
    metodosPagoService = {
      asegurarMetodo: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PagosService,
        { provide: getRepositoryToken(ConfiguracionPagoWompi), useValue: repo },
        {
          provide: getRepositoryToken(TransaccionPago),
          useValue: { create: jest.fn(), save: jest.fn() },
        },
        {
          provide: WompiClientService,
          useValue: {
            obtenerTokensAceptacion: jest.fn(),
            crearTransaccion: jest.fn(),
          },
        },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
        { provide: MetodosPagoService, useValue: metodosPagoService },
        {
          provide: ClsService,
          useValue: { get: jest.fn().mockReturnValue('n1') },
        },
      ],
    }).compile();
    service = moduleRef.get(PagosService);
  });

  it('no permite activar sin las 4 credenciales', async () => {
    repo.findOne.mockResolvedValue({
      negocioId: 'n1',
      llavePublica: 'pub',
      llavePrivadaCifrada: null,
      llaveSecretaEventosCifrada: null,
      llaveIntegridadCifrada: null,
      activo: false,
    });
    await expect(service.activar()).rejects.toThrow(BadRequestException);
  });

  it('no permite activar si faltan solo la llave de integridad (las otras 3 completas)', async () => {
    repo.findOne.mockResolvedValue({
      negocioId: 'n1',
      llavePublica: 'pub',
      llavePrivadaCifrada: 'xxx',
      llaveSecretaEventosCifrada: 'yyy',
      llaveIntegridadCifrada: null,
      activo: false,
    });
    await expect(service.activar()).rejects.toThrow(BadRequestException);
  });

  it('activa cuando las 4 credenciales están presentes', async () => {
    repo.findOne.mockResolvedValue({
      negocioId: 'n1',
      llavePublica: 'pub',
      llavePrivadaCifrada: 'xxx',
      llaveSecretaEventosCifrada: 'yyy',
      llaveIntegridadCifrada: 'zzz',
      activo: false,
    });
    await service.activar();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: true }),
    );
  });

  it('activar asegura los métodos de pago "Wompi - QR" y "Wompi - NEQUI" en el catálogo del negocio', async () => {
    repo.findOne.mockResolvedValue({
      negocioId: 'n1',
      llavePublica: 'pub',
      llavePrivadaCifrada: 'xxx',
      llaveSecretaEventosCifrada: 'yyy',
      llaveIntegridadCifrada: 'zzz',
      activo: false,
    });
    await service.activar();
    expect(metodosPagoService.asegurarMetodo).toHaveBeenCalledWith(
      'Wompi - QR',
    );
    expect(metodosPagoService.asegurarMetodo).toHaveBeenCalledWith(
      'Wompi - NEQUI',
    );
  });

  it('si asegurar los métodos de pago falla, NO marca la configuración como activa (fail-closed)', async () => {
    repo.findOne.mockResolvedValue({
      negocioId: 'n1',
      llavePublica: 'pub',
      llavePrivadaCifrada: 'xxx',
      llaveSecretaEventosCifrada: 'yyy',
      llaveIntegridadCifrada: 'zzz',
      activo: false,
    });
    metodosPagoService.asegurarMetodo.mockRejectedValueOnce(
      new Error('DB caída'),
    );
    await expect(service.activar()).rejects.toThrow('DB caída');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('la configuración pública nunca expone la llave privada ni la de integridad', async () => {
    repo.findOne.mockResolvedValue({
      negocioId: 'n1',
      llavePublica: 'pub',
      llavePrivadaCifrada: 'xxx',
      llaveSecretaEventosCifrada: 'yyy',
      llaveIntegridadCifrada: 'zzz',
      activo: true,
      qrHabilitado: true,
      nequiHabilitado: true,
      pseHabilitado: false,
      tarjetaHabilitado: false,
    });
    const publica = await service.obtenerConfiguracionPublica();
    expect(publica).not.toHaveProperty('llavePrivadaCifrada');
    expect(publica).not.toHaveProperty('llaveIntegridadCifrada');
    expect(publica).toEqual({
      llavePublica: 'pub',
      activo: true,
      configurado: true,
      qrHabilitado: true,
      nequiHabilitado: true,
      pseHabilitado: false,
      tarjetaHabilitado: false,
    });
  });

  it('la configuración pública devuelve los 4 booleanos en default `true` cuando el negocio nunca configuró Wompi', async () => {
    repo.findOne.mockResolvedValue(null);
    const publica = await service.obtenerConfiguracionPublica();
    expect(publica).toEqual({
      llavePublica: null,
      activo: false,
      configurado: false,
      qrHabilitado: true,
      nequiHabilitado: true,
      pseHabilitado: true,
      tarjetaHabilitado: true,
    });
  });

  it('guardar solo credenciales (sin tocar los 4 booleanos) no pisa sus valores previos con undefined', async () => {
    const configExistente: any = {
      negocioId: 'n1',
      llavePublica: 'pub-vieja',
      llavePrivadaCifrada: 'xxx-vieja',
      llaveSecretaEventosCifrada: 'yyy-vieja',
      activo: true,
      qrHabilitado: false,
      nequiHabilitado: true,
      pseHabilitado: false,
      tarjetaHabilitado: true,
    };
    repo.findOne.mockResolvedValue(configExistente);

    await service.guardarConfiguracion({
      llavePublica: 'pub-nueva',
      llavePrivada: 'priv-nueva',
      llaveSecretaEventos: 'secreto-nuevo',
      llaveIntegridad: 'integridad-nueva',
      // Los 4 booleanos NO vienen en este DTO — no deben pisarse.
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        llavePublica: 'pub-nueva',
        llaveIntegridadCifrada: expect.any(String),
        qrHabilitado: false,
        nequiHabilitado: true,
        pseHabilitado: false,
        tarjetaHabilitado: true,
      }),
    );
  });

  it('guardarConfiguracion con credenciales + los 4 booleanos persiste los 4 booleanos correctamente', async () => {
    const configExistente: any = {
      negocioId: 'n1',
      llavePublica: 'pub-vieja',
      llavePrivadaCifrada: 'xxx-vieja',
      llaveSecretaEventosCifrada: 'yyy-vieja',
      activo: true,
      qrHabilitado: true,
      nequiHabilitado: true,
      pseHabilitado: true,
      tarjetaHabilitado: true,
    };
    repo.findOne.mockResolvedValue(configExistente);

    await service.guardarConfiguracion({
      llavePublica: 'pub-nueva',
      llavePrivada: 'priv-nueva',
      llaveSecretaEventos: 'secreto-nuevo',
      llaveIntegridad: 'integridad-nueva',
      qrHabilitado: true,
      nequiHabilitado: true,
      pseHabilitado: false,
      tarjetaHabilitado: false,
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        qrHabilitado: true,
        nequiHabilitado: true,
        pseHabilitado: false,
        tarjetaHabilitado: false,
      }),
    );
  });

  it('guardarConfiguracion con solo un subset de los 4 booleanos solo pisa esos, dejando el resto intacto', async () => {
    const configExistente: any = {
      negocioId: 'n1',
      llavePublica: 'pub-vieja',
      llavePrivadaCifrada: 'xxx-vieja',
      llaveSecretaEventosCifrada: 'yyy-vieja',
      activo: true,
      qrHabilitado: true,
      nequiHabilitado: true,
      pseHabilitado: true,
      tarjetaHabilitado: true,
    };
    repo.findOne.mockResolvedValue(configExistente);

    await service.guardarConfiguracion({
      llavePublica: 'pub-nueva',
      llavePrivada: 'priv-nueva',
      llaveSecretaEventos: 'secreto-nuevo',
      llaveIntegridad: 'integridad-nueva',
      pseHabilitado: false,
      // qrHabilitado, nequiHabilitado y tarjetaHabilitado no vienen — deben quedar como estaban.
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        qrHabilitado: true,
        nequiHabilitado: true,
        pseHabilitado: false,
        tarjetaHabilitado: true,
      }),
    );
  });
});

describe('PagosService — iniciar pago', () => {
  let service: PagosService;
  let configRepo: { findOne: jest.Mock };
  let transaccionRepo: { create: jest.Mock; save: jest.Mock };
  let wompiClient: {
    obtenerTokensAceptacion: jest.Mock;
    crearTransaccion: jest.Mock;
    obtenerTransaccion: jest.Mock;
  };

  beforeAll(() => {
    process.env.CIFRADO_CLAVE_MAESTRA =
      '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
  });

  beforeEach(async () => {
    configRepo = {
      findOne: jest.fn().mockResolvedValue({
        negocioId: 'n1',
        llavePublica: 'pub',
        llavePrivadaCifrada: encriptar('prv_real'),
        llaveIntegridadCifrada: encriptar('integrity_real'),
        activo: true,
      }),
    };
    transaccionRepo = {
      create: jest.fn((x: Partial<TransaccionPago>) => x),
      save: jest.fn((x: Partial<TransaccionPago>) => x),
    };
    wompiClient = {
      obtenerTokensAceptacion: jest.fn().mockResolvedValue({
        acceptanceToken: 'tok-a',
        acceptPersonalAuth: 'tok-b',
      }),
      crearTransaccion: jest
        .fn()
        .mockResolvedValue({ wompiTransactionId: 'txn-1', status: 'PENDING' }),
      // Default: resuelve con `qr_image` ya en el primer intento — los tests que no le importa el
      // polling en sí (ej. los de traducción de `payment_method` por método) no se cuelgan
      // esperando varias vueltas del loop real de `esperarQrImagen`.
      obtenerTransaccion: jest.fn().mockResolvedValue({
        status: 'PENDING',
        extra: { qr_image: 'default-qr' },
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PagosService,
        {
          provide: getRepositoryToken(ConfiguracionPagoWompi),
          useValue: configRepo,
        },
        {
          provide: getRepositoryToken(TransaccionPago),
          useValue: transaccionRepo,
        },
        { provide: WompiClientService, useValue: wompiClient },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
        {
          provide: MetodosPagoService,
          useValue: { asegurarMetodo: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ClsService,
          useValue: { get: jest.fn().mockReturnValue('n1') },
        },
      ],
    }).compile();
    service = moduleRef.get(PagosService);
  });

  it('rechaza si Wompi no está activo para el negocio', async () => {
    configRepo.findOne.mockResolvedValue({ negocioId: 'n1', activo: false });
    await expect(
      service.iniciarPago({
        montoEnCentavos: 1000000,
        metodo: 'NEQUI',
        datosMetodo: {},
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('crea la transacción en Wompi con la llave privada desencriptada', async () => {
    await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'NEQUI',
      datosMetodo: { phone_number: '3001234567' },
    });
    expect(wompiClient.crearTransaccion).toHaveBeenCalledWith(
      expect.objectContaining({
        llavePrivada: 'prv_real',
        amountInCents: 1000000,
        currency: 'COP',
      }),
    );
  });

  it('firma la transacción con SHA256(referencia + monto + moneda + llave de integridad desencriptada) — Wompi rechaza el POST /transactions sin esto', async () => {
    const resultado = await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'NEQUI',
      datosMetodo: { phone_number: '3001234567' },
    });

    const firmaEsperada = createHash('sha256')
      .update(`${resultado.referencia}1000000COPintegrity_real`)
      .digest('hex');

    expect(wompiClient.crearTransaccion).toHaveBeenCalledWith(
      expect.objectContaining({ signature: firmaEsperada }),
    );
  });

  it('persiste la TransaccionPago en estado PENDIENTE con la referencia generada', async () => {
    await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'NEQUI',
      datosMetodo: {},
    });
    expect(transaccionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        estado: 'PENDIENTE',
        negocioId: 'n1',
        metodoPago: 'NEQUI',
      }),
    );
  });

  it('método NEQUI: manda type "NEQUI" tal cual y NO inyecta payment_description', async () => {
    await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'NEQUI',
      datosMetodo: { phone_number: '3001234567' },
    });
    expect(wompiClient.crearTransaccion).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: { type: 'NEQUI', phone_number: '3001234567' },
      }),
    );
  });

  it('método QR: traduce el type a "BANCOLOMBIA_QR" e inyecta payment_description', async () => {
    await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'QR',
      datosMetodo: {},
    });
    expect(wompiClient.crearTransaccion).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: {
          type: 'BANCOLOMBIA_QR',
          payment_description: 'Venta POS',
        },
      }),
    );
  });

  it('método NEQUI: NO dispara polling contra obtenerTransaccion (Wompi no genera qr_image para este método)', async () => {
    await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'NEQUI',
      datosMetodo: { phone_number: '3001234567' },
    });
    expect(wompiClient.obtenerTransaccion).not.toHaveBeenCalled();
  });

  it('método QR: si `POST /transactions` no trae `qr_image` todavía, hace polling contra `GET /transactions` hasta encontrarlo', async () => {
    wompiClient.crearTransaccion.mockResolvedValueOnce({
      wompiTransactionId: 'txn-qr-pendiente',
      status: 'PENDING',
      extra: undefined, // Wompi documenta que para BANCOLOMBIA_QR esto siempre llega vacío al crear
    });
    wompiClient.obtenerTransaccion
      .mockResolvedValueOnce({ status: 'PENDING', extra: undefined }) // Wompi todavía generando el QR
      .mockResolvedValueOnce({
        status: 'PENDING',
        extra: { qr_image: 'PHN2Zz4=' },
      });

    const resultado = await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'QR',
      datosMetodo: {},
    });

    expect(resultado.extra).toEqual({ qr_image: 'PHN2Zz4=' });
    expect(wompiClient.obtenerTransaccion).toHaveBeenCalledWith(
      'txn-qr-pendiente',
      'pub',
    );
    expect(wompiClient.obtenerTransaccion).toHaveBeenCalledTimes(2);
  });

  it('método QR: si el polling se agota sin encontrar `qr_image`, devuelve `extra` vacío en vez de colgarse indefinidamente', async () => {
    wompiClient.crearTransaccion.mockResolvedValueOnce({
      wompiTransactionId: 'txn-qr-nunca-llega',
      status: 'PENDING',
      extra: undefined,
    });
    wompiClient.obtenerTransaccion.mockResolvedValue({
      status: 'PENDING',
      extra: undefined,
    });

    const resultado = await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'QR',
      datosMetodo: {},
    });

    expect(resultado.extra).toBeUndefined();
    // Presupuesto fijo del polling (ver `PagosService.esperarQrImagen`) — no reintenta para siempre.
    expect(wompiClient.obtenerTransaccion.mock.calls.length).toBeGreaterThan(1);
  }, 10000);

  it('método PSE: inyecta payment_description pero preserva los campos propios de datosMetodo (user_type, etc.)', async () => {
    await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'PSE',
      datosMetodo: {
        user_type: 0,
        user_legal_id_type: 'CC',
        user_legal_id: '123456789',
        financial_institution_code: '1',
      },
    });
    expect(wompiClient.crearTransaccion).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: {
          type: 'PSE',
          payment_description: 'Venta POS',
          user_type: 0,
          user_legal_id_type: 'CC',
          user_legal_id: '123456789',
          financial_institution_code: '1',
        },
      }),
    );
  });

  it('método TARJETA: traduce el type a "CARD"', async () => {
    await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'TARJETA',
      datosMetodo: { token: 'tok_test_card' },
    });
    expect(wompiClient.crearTransaccion).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: { type: 'CARD', token: 'tok_test_card' },
      }),
    );
  });

  it('no deja que un `type` colado en datosMetodo pise el type real decidido por el método', async () => {
    await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'QR',
      // Un frontend con bug (o malicioso) intenta forzar el cobro como NEQUI
      // dentro de datosMetodo — no debe poder pisar el type real.
      datosMetodo: { type: 'NEQUI' },
    });
    expect(wompiClient.crearTransaccion).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: expect.objectContaining({ type: 'BANCOLOMBIA_QR' }),
      }),
    );
  });

  it('un payment_description propio en datosMetodo NO es pisado por el default inyectado', async () => {
    await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'PSE',
      datosMetodo: {
        payment_description: 'Descripción propia del caller',
      },
    });
    expect(wompiClient.crearTransaccion).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: expect.objectContaining({
          payment_description: 'Descripción propia del caller',
        }),
      }),
    );
  });

  it('devuelve `extra` tal cual cuando el cliente Wompi lo trae (QR)', async () => {
    wompiClient.crearTransaccion.mockResolvedValue({
      wompiTransactionId: 'txn-qr',
      status: 'PENDING',
      extra: { qr_image: 'data:image/png;base64,AAAA' },
    });

    const resultado = await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'QR',
      datosMetodo: {},
    });

    expect(resultado).toEqual({
      referencia: expect.any(String),
      wompiTransactionId: 'txn-qr',
      extra: { qr_image: 'data:image/png;base64,AAAA' },
    });
  });

  it('devuelve `extra: undefined` cuando el cliente Wompi no lo trae (NEQUI)', async () => {
    // El mock por defecto del describe ya no manda `extra` — resultado esperado: undefined.
    const resultado = await service.iniciarPago({
      montoEnCentavos: 1000000,
      metodo: 'NEQUI',
      datosMetodo: {},
    });

    expect(resultado).toEqual({
      referencia: expect.any(String),
      wompiTransactionId: 'txn-1',
      extra: undefined,
    });
  });
});

describe('PagosService — webhook', () => {
  let service: PagosService;
  let configRepo: { findOne: jest.Mock };
  let transaccionRepo: { findOne: jest.Mock; save: jest.Mock };
  let realtimeGateway: { emitToNegocio: jest.Mock };

  const SECRETO = 'secreto-real';

  beforeAll(() => {
    process.env.CIFRADO_CLAVE_MAESTRA =
      '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
  });

  beforeEach(async () => {
    configRepo = {
      findOne: jest.fn().mockResolvedValue({
        negocioId: 'n1',
        llaveSecretaEventosCifrada: encriptar(SECRETO),
      }),
    };
    transaccionRepo = {
      findOne: jest.fn().mockResolvedValue({
        referencia: 'ref-abc',
        negocioId: 'n1',
        estado: 'PENDIENTE',
      }),
      save: jest.fn((x: Partial<TransaccionPago>) => x),
    };
    realtimeGateway = { emitToNegocio: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PagosService,
        {
          provide: getRepositoryToken(ConfiguracionPagoWompi),
          useValue: configRepo,
        },
        {
          provide: getRepositoryToken(TransaccionPago),
          useValue: transaccionRepo,
        },
        { provide: WompiClientService, useValue: {} },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        {
          provide: MetodosPagoService,
          useValue: { asegurarMetodo: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(PagosService);
  });

  it('descarta el evento si la firma no coincide', async () => {
    const payload = {
      event: 'transaction.updated',
      data: {
        transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' },
      },
      signature: {
        properties: ['transaction.id', 'transaction.status'],
        checksum: 'firma-invalida',
      },
      timestamp: 1234567890,
    };
    await service.procesarWebhook(payload);
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('descarta el evento si la firma fue calculada con un secreto distinto (firma trucada de otro negocio)', async () => {
    const data = {
      transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' },
    };
    const timestamp = 1234567890;
    const checksum = firmarEvento(
      ['transaction.id', 'transaction.status'],
      data,
      timestamp,
      'secreto-equivocado',
    );
    await service.procesarWebhook({
      event: 'transaction.updated',
      data,
      signature: {
        properties: ['transaction.id', 'transaction.status'],
        checksum,
      },
      timestamp,
    });
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('descarta el evento si el payload fue alterado después de firmarlo (status distinto al firmado)', async () => {
    const data = {
      transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' },
    };
    const timestamp = 1234567890;
    // Firma calculada con el status real (APPROVED)...
    const checksum = firmarEvento(
      ['transaction.id', 'transaction.status'],
      data,
      timestamp,
      SECRETO,
    );
    // ...pero el atacante intenta colar un status distinto sin volver a firmar.
    const dataAlterada = {
      transaction: { ...data.transaction, status: 'DECLINED' },
    };
    await service.procesarWebhook({
      event: 'transaction.updated',
      data: dataAlterada,
      signature: {
        properties: ['transaction.id', 'transaction.status'],
        checksum,
      },
      timestamp,
    });
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  // Forma real del payload de Wompi para transaction.updated: firma TRES
  // propiedades, no dos. Es la fixture "feliz" primaria a partir de acá —
  // Wompi documenta que este set puede variar, así que el código no puede
  // asumir exactamente estas tres, pero sí es lo que realmente manda hoy.
  const PROPERTIES_REALISTA = [
    'transaction.id',
    'transaction.status',
    'transaction.amount_in_cents',
  ];

  it('actualiza la transacción a APROBADA y emite el evento realtime cuando la firma es válida (properties real de Wompi: 3 elementos)', async () => {
    const data = {
      transaction: {
        id: 'txn-1',
        status: 'APPROVED',
        reference: 'ref-abc',
        amount_in_cents: 1000000,
      },
    };
    const timestamp = 1234567890;
    const checksum = firmarEvento(
      PROPERTIES_REALISTA,
      data,
      timestamp,
      SECRETO,
    );

    await service.procesarWebhook({
      event: 'transaction.updated',
      data,
      signature: { properties: PROPERTIES_REALISTA, checksum },
      timestamp,
    });

    expect(transaccionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        estado: 'APROBADA',
        wompiTransactionId: 'txn-1',
      }),
    );
    expect(realtimeGateway.emitToNegocio).toHaveBeenCalledWith(
      'n1',
      'pago-wompi:confirmado',
      {
        referencia: 'ref-abc',
      },
    );
  });

  it('actualiza la transacción a DECLINADA y emite `pago-wompi:declinado` (no `:confirmado`) cuando Wompi declina el pago', async () => {
    const data = {
      transaction: {
        id: 'txn-1',
        status: 'DECLINED',
        reference: 'ref-abc',
        amount_in_cents: 1000000,
      },
    };
    const timestamp = 1234567890;
    const checksum = firmarEvento(
      PROPERTIES_REALISTA,
      data,
      timestamp,
      SECRETO,
    );

    await service.procesarWebhook({
      event: 'transaction.updated',
      data,
      signature: { properties: PROPERTIES_REALISTA, checksum },
      timestamp,
    });

    expect(transaccionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'DECLINADA' }),
    );
    // Antes NO se emitía nada en DECLINADA — el cajero se quedaba esperando para siempre sin
    // ninguna señal (bug real reportado en vivo). Ahora sí avisa, con un evento distinto al de
    // aprobación para que el frontend reaccione distinto.
    expect(realtimeGateway.emitToNegocio).toHaveBeenCalledWith(
      'n1',
      'pago-wompi:declinado',
      { referencia: 'ref-abc' },
    );
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalledWith(
      expect.anything(),
      'pago-wompi:confirmado',
      expect.anything(),
    );
  });

  it('acepta un checksum válido enviado en mayúsculas (comparación case-insensitive)', async () => {
    const data = {
      transaction: {
        id: 'txn-1',
        status: 'APPROVED',
        reference: 'ref-abc',
        amount_in_cents: 1000000,
      },
    };
    const timestamp = 1234567890;
    const checksum = firmarEvento(
      PROPERTIES_REALISTA,
      data,
      timestamp,
      SECRETO,
    ).toUpperCase();

    await service.procesarWebhook({
      event: 'transaction.updated',
      data,
      signature: { properties: PROPERTIES_REALISTA, checksum },
      timestamp,
    });

    expect(transaccionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'APROBADA' }),
    );
    expect(realtimeGateway.emitToNegocio).toHaveBeenCalledTimes(1);
  });

  it('un evento con status intermedio (PENDING) no guarda ni consume el guard de PENDIENTE, y un APPROVED genuino posterior sigue resolviendo la transacción', async () => {
    // Misma referencia de objeto en las tres llamadas — si el evento PENDING
    // mutara `estado`, el guard "solo transiciona una vez desde PENDIENTE"
    // quedaría consumido y el APPROVED posterior se descartaría en silencio.
    const transaccionMutable = {
      referencia: 'ref-abc',
      negocioId: 'n1',
      estado: 'PENDIENTE',
      wompiTransactionId: 'txn-1',
    };
    transaccionRepo.findOne.mockResolvedValue(transaccionMutable);

    const timestamp1 = 1234567890;
    const dataPending = {
      transaction: {
        id: 'txn-1',
        status: 'PENDING',
        reference: 'ref-abc',
        amount_in_cents: 1000000,
      },
    };
    const checksumPending = firmarEvento(
      PROPERTIES_REALISTA,
      dataPending,
      timestamp1,
      SECRETO,
    );
    await service.procesarWebhook({
      event: 'transaction.updated',
      data: dataPending,
      signature: { properties: PROPERTIES_REALISTA, checksum: checksumPending },
      timestamp: timestamp1,
    });
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
    expect(transaccionMutable.estado).toBe('PENDIENTE');

    const timestamp2 = 1234567999;
    const dataApproved = {
      transaction: {
        id: 'txn-1',
        status: 'APPROVED',
        reference: 'ref-abc',
        amount_in_cents: 1000000,
      },
    };
    const checksumApproved = firmarEvento(
      PROPERTIES_REALISTA,
      dataApproved,
      timestamp2,
      SECRETO,
    );
    await service.procesarWebhook({
      event: 'transaction.updated',
      data: dataApproved,
      signature: {
        properties: PROPERTIES_REALISTA,
        checksum: checksumApproved,
      },
      timestamp: timestamp2,
    });

    expect(transaccionRepo.save).toHaveBeenCalledTimes(1);
    expect(transaccionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'APROBADA' }),
    );
    expect(realtimeGateway.emitToNegocio).toHaveBeenCalledTimes(1);
  });

  it('ignora eventos que no son transaction.updated', async () => {
    await service.procesarWebhook({
      event: 'transaction.created',
      data: {
        transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' },
      },
      signature: { properties: ['transaction.id'], checksum: 'lo-que-sea' },
      timestamp: 1234567890,
    });
    expect(transaccionRepo.findOne).not.toHaveBeenCalled();
    expect(transaccionRepo.save).not.toHaveBeenCalled();
  });

  it('descarta el evento en silencio (sin lanzar) si signature.properties está mal formado', async () => {
    const payload = {
      event: 'transaction.updated',
      data: {
        transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' },
      },
      // properties no es un array — no debe tirar una excepción sin manejar.
      signature: {
        properties: 'transaction.id' as unknown as string[],
        checksum: 'lo-que-sea',
      },
      timestamp: 1234567890,
    };
    await expect(service.procesarWebhook(payload)).resolves.toBeUndefined();
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('descarta el evento si no encuentra ninguna transacción con esa referencia', async () => {
    transaccionRepo.findOne.mockResolvedValue(null);
    const data = {
      transaction: {
        id: 'txn-1',
        status: 'APPROVED',
        reference: 'ref-inexistente',
      },
    };
    const timestamp = 1234567890;
    const checksum = firmarEvento(
      ['transaction.id', 'transaction.status'],
      data,
      timestamp,
      SECRETO,
    );
    await service.procesarWebhook({
      event: 'transaction.updated',
      data,
      signature: {
        properties: ['transaction.id', 'transaction.status'],
        checksum,
      },
      timestamp,
    });
    expect(configRepo.findOne).not.toHaveBeenCalled();
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('descarta el evento si signature.properties no viene en el payload', async () => {
    const data = {
      transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' },
    };
    const timestamp = 1234567890;
    const checksum = firmarEvento(
      ['transaction.id', 'transaction.status'],
      data,
      timestamp,
      SECRETO,
    );
    const payload: any = {
      event: 'transaction.updated',
      data,
      signature: { checksum }, // properties ausente
      timestamp,
    };
    await service.procesarWebhook(payload);
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('descarta el evento si signature.properties no incluye "transaction.status" (aunque la firma sea válida para esas properties)', async () => {
    const data = {
      transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' },
    };
    const timestamp = 1234567890;
    // Firma calculada (y válida) solo sobre transaction.id — el checksum no
    // cubre transaction.status, que es un campo del que este método depende.
    const checksum = firmarEvento(['transaction.id'], data, timestamp, SECRETO);
    await service.procesarWebhook({
      event: 'transaction.updated',
      data,
      signature: { properties: ['transaction.id'], checksum },
      timestamp,
    });
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('descarta el evento si signature.properties no incluye "transaction.id" (aunque la firma sea válida para esas properties)', async () => {
    const data = {
      transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' },
    };
    const timestamp = 1234567890;
    // Firma calculada (y válida) solo sobre transaction.status — el checksum
    // no cubre transaction.id, usado en el cross-check contra wompiTransactionId.
    const checksum = firmarEvento(
      ['transaction.status'],
      data,
      timestamp,
      SECRETO,
    );
    await service.procesarWebhook({
      event: 'transaction.updated',
      data,
      signature: { properties: ['transaction.status'], checksum },
      timestamp,
    });
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('acepta signature.properties con propiedades EXTRA además de las dos requeridas (Wompi puede agregar más campos firmados)', async () => {
    const data = {
      transaction: {
        id: 'txn-1',
        status: 'APPROVED',
        reference: 'ref-abc',
        amount_in_cents: 1000000,
        currency: 'COP',
      },
    };
    const timestamp = 1234567890;
    const propertiesConExtra = [
      'transaction.amount_in_cents',
      'transaction.currency',
      'transaction.id',
      'transaction.status',
    ];
    const checksum = firmarEvento(propertiesConExtra, data, timestamp, SECRETO);
    await service.procesarWebhook({
      event: 'transaction.updated',
      data,
      signature: { properties: propertiesConExtra, checksum },
      timestamp,
    });
    expect(transaccionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'APROBADA' }),
    );
  });

  it('descarta el evento (ataque de swap de reference) si transaction.id no coincide con el wompiTransactionId ya registrado para esa referencia', async () => {
    // La transacción en DB fue creada por iniciarPago contra el wompiTransactionId 'txn-legitima'.
    transaccionRepo.findOne.mockResolvedValue({
      referencia: 'ref-abc',
      negocioId: 'n1',
      estado: 'PENDIENTE',
      wompiTransactionId: 'txn-legitima',
    });
    // El atacante reusa un checksum válido capturado para OTRA transacción (txn-1),
    // apuntándolo a 'ref-abc' vía el campo `reference` (no firmado).
    const data = {
      transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' },
    };
    const timestamp = 1234567890;
    const checksum = firmarEvento(
      ['transaction.id', 'transaction.status'],
      data,
      timestamp,
      SECRETO,
    );
    await service.procesarWebhook({
      event: 'transaction.updated',
      data,
      signature: {
        properties: ['transaction.id', 'transaction.status'],
        checksum,
      },
      timestamp,
    });
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('reenviar el mismo evento válido dos veces es un no-op la segunda vez (no re-save, no re-emit)', async () => {
    // El mock de findOne devuelve la MISMA referencia de objeto en ambas llamadas —
    // el service la muta in-place, así que tras la 1ª pasada estado deja de ser PENDIENTE.
    const transaccionMutable = {
      referencia: 'ref-abc',
      negocioId: 'n1',
      estado: 'PENDIENTE',
      wompiTransactionId: 'txn-1',
    };
    transaccionRepo.findOne.mockResolvedValue(transaccionMutable);

    const data = {
      transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' },
    };
    const timestamp = 1234567890;
    const checksum = firmarEvento(
      ['transaction.id', 'transaction.status'],
      data,
      timestamp,
      SECRETO,
    );
    const payload = {
      event: 'transaction.updated' as const,
      data,
      signature: {
        properties: ['transaction.id', 'transaction.status'],
        checksum,
      },
      timestamp,
    };

    await service.procesarWebhook(payload);
    expect(transaccionRepo.save).toHaveBeenCalledTimes(1);
    expect(realtimeGateway.emitToNegocio).toHaveBeenCalledTimes(1);

    await service.procesarWebhook(payload);
    expect(transaccionRepo.save).toHaveBeenCalledTimes(1);
    expect(realtimeGateway.emitToNegocio).toHaveBeenCalledTimes(1);
  });
});

describe('PagosService — reconciliación de pendientes (respaldo del webhook por polling)', () => {
  let service: PagosService;
  let configRepo: { findOne: jest.Mock };
  let transaccionRepo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let wompiClient: { obtenerTransaccion: jest.Mock };
  let realtimeGateway: { emitToNegocio: jest.Mock };

  beforeAll(() => {
    process.env.CIFRADO_CLAVE_MAESTRA =
      '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
  });

  const transaccionPendienteReciente = (): any => ({
    id: 't1',
    negocioId: 'n1',
    referencia: 'ref-1',
    wompiTransactionId: 'txn-1',
    estado: 'PENDIENTE',
    createdAt: new Date(), // recién creada — dentro de la ventana de 1h
  });

  beforeEach(async () => {
    configRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ negocioId: 'n1', llavePublica: 'pub' }),
    };
    transaccionRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn((x: any) => x),
    };
    wompiClient = { obtenerTransaccion: jest.fn() };
    realtimeGateway = { emitToNegocio: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PagosService,
        {
          provide: getRepositoryToken(ConfiguracionPagoWompi),
          useValue: configRepo,
        },
        {
          provide: getRepositoryToken(TransaccionPago),
          useValue: transaccionRepo,
        },
        { provide: WompiClientService, useValue: wompiClient },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        {
          provide: MetodosPagoService,
          useValue: { asegurarMetodo: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(PagosService);
  });

  it('no hace nada si no hay transacciones PENDIENTE', async () => {
    await service.reconciliarPendientes();
    expect(wompiClient.obtenerTransaccion).not.toHaveBeenCalled();
  });

  it('consulta Wompi con la llave pública del negocio de la transacción y aprueba si Wompi ya la confirmó', async () => {
    const pendiente = transaccionPendienteReciente();
    transaccionRepo.find.mockResolvedValue([pendiente]);
    transaccionRepo.findOne.mockResolvedValue(pendiente); // re-chequeo: sigue PENDIENTE
    wompiClient.obtenerTransaccion.mockResolvedValue({
      status: 'APPROVED',
      extra: undefined,
    });

    await service.reconciliarPendientes();

    expect(wompiClient.obtenerTransaccion).toHaveBeenCalledWith('txn-1', 'pub');
    expect(transaccionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'APROBADA' }),
    );
    expect(realtimeGateway.emitToNegocio).toHaveBeenCalledWith(
      'n1',
      'pago-wompi:confirmado',
      { referencia: 'ref-1' },
    );
  });

  it('marca DECLINADA y emite `pago-wompi:declinado` cuando Wompi declinó el pago', async () => {
    const pendiente = transaccionPendienteReciente();
    transaccionRepo.find.mockResolvedValue([pendiente]);
    transaccionRepo.findOne.mockResolvedValue(pendiente);
    wompiClient.obtenerTransaccion.mockResolvedValue({
      status: 'DECLINED',
      extra: undefined,
    });

    await service.reconciliarPendientes();

    expect(transaccionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'DECLINADA' }),
    );
    expect(realtimeGateway.emitToNegocio).toHaveBeenCalledWith(
      'n1',
      'pago-wompi:declinado',
      { referencia: 'ref-1' },
    );
  });

  it('no toca nada si Wompi todavía la muestra PENDING (estado intermedio, no terminal)', async () => {
    const pendiente = transaccionPendienteReciente();
    transaccionRepo.find.mockResolvedValue([pendiente]);
    wompiClient.obtenerTransaccion.mockResolvedValue({
      status: 'PENDING',
      extra: undefined,
    });

    await service.reconciliarPendientes();

    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('ignora transacciones más viejas que 1 hora (el cliente ya abandonó el pago) sin llamar a Wompi', async () => {
    const vieja = {
      ...transaccionPendienteReciente(),
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    };
    transaccionRepo.find.mockResolvedValue([vieja]);

    await service.reconciliarPendientes();

    expect(wompiClient.obtenerTransaccion).not.toHaveBeenCalled();
  });

  it('no pisa una transacción que el webhook ya resolvió mientras el polling estaba en curso (re-chequeo contra la DB)', async () => {
    const pendiente = transaccionPendienteReciente();
    transaccionRepo.find.mockResolvedValue([pendiente]);
    wompiClient.obtenerTransaccion.mockResolvedValue({
      status: 'APPROVED',
      extra: undefined,
    });
    // El re-chequeo ve que el webhook ya la resolvió (ya no está PENDIENTE) mientras esta vuelta
    // del polling estaba en curso.
    transaccionRepo.findOne.mockResolvedValue({
      ...pendiente,
      estado: 'APROBADA',
    });

    await service.reconciliarPendientes();

    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('salta transacciones sin wompiTransactionId (nunca debería pasar, pero no debe romper el loop del resto)', async () => {
    const sinTransactionId = {
      ...transaccionPendienteReciente(),
      wompiTransactionId: null,
    };
    const valida = transaccionPendienteReciente();
    transaccionRepo.find.mockResolvedValue([sinTransactionId, valida]);
    transaccionRepo.findOne.mockResolvedValue(valida);
    wompiClient.obtenerTransaccion.mockResolvedValue({
      status: 'APPROVED',
      extra: undefined,
    });

    await service.reconciliarPendientes();

    expect(wompiClient.obtenerTransaccion).toHaveBeenCalledTimes(1);
    expect(wompiClient.obtenerTransaccion).toHaveBeenCalledWith('txn-1', 'pub');
  });
});
