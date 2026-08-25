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

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn((x: ConfiguracionPagoWompi) => x),
      create: jest.fn((x: Partial<ConfiguracionPagoWompi>) => x),
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
        {
          provide: ClsService,
          useValue: { get: jest.fn().mockReturnValue('n1') },
        },
      ],
    }).compile();
    service = moduleRef.get(PagosService);
  });

  it('no permite activar sin las 3 credenciales', async () => {
    repo.findOne.mockResolvedValue({
      negocioId: 'n1',
      llavePublica: 'pub',
      llavePrivadaCifrada: null,
      llaveSecretaEventosCifrada: null,
      activo: false,
    });
    await expect(service.activar()).rejects.toThrow(BadRequestException);
  });

  it('activa cuando las 3 credenciales están presentes', async () => {
    repo.findOne.mockResolvedValue({
      negocioId: 'n1',
      llavePublica: 'pub',
      llavePrivadaCifrada: 'xxx',
      llaveSecretaEventosCifrada: 'yyy',
      activo: false,
    });
    await service.activar();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ activo: true }),
    );
  });

  it('la configuración pública nunca expone la llave privada', async () => {
    repo.findOne.mockResolvedValue({
      negocioId: 'n1',
      llavePublica: 'pub',
      llavePrivadaCifrada: 'xxx',
      llaveSecretaEventosCifrada: 'yyy',
      activo: true,
    });
    const publica = await service.obtenerConfiguracionPublica();
    expect(publica).not.toHaveProperty('llavePrivadaCifrada');
    expect(publica).toEqual({
      llavePublica: 'pub',
      activo: true,
      configurado: true,
    });
  });
});

describe('PagosService — iniciar pago', () => {
  let service: PagosService;
  let configRepo: { findOne: jest.Mock };
  let transaccionRepo: { create: jest.Mock; save: jest.Mock };
  let wompiClient: {
    obtenerTokensAceptacion: jest.Mock;
    crearTransaccion: jest.Mock;
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
      }),
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
        { provide: getRepositoryToken(ConfiguracionPagoWompi), useValue: configRepo },
        { provide: getRepositoryToken(TransaccionPago), useValue: transaccionRepo },
        { provide: WompiClientService, useValue: {} },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: ClsService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(PagosService);
  });

  it('descarta el evento si la firma no coincide', async () => {
    const payload = {
      event: 'transaction.updated',
      data: { transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' } },
      signature: { properties: ['transaction.id', 'transaction.status'], checksum: 'firma-invalida' },
      timestamp: 1234567890,
    };
    await service.procesarWebhook(payload);
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('descarta el evento si la firma fue calculada con un secreto distinto (firma trucada de otro negocio)', async () => {
    const data = { transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' } };
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
      signature: { properties: ['transaction.id', 'transaction.status'], checksum },
      timestamp,
    });
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('descarta el evento si el payload fue alterado después de firmarlo (status distinto al firmado)', async () => {
    const data = { transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' } };
    const timestamp = 1234567890;
    // Firma calculada con el status real (APPROVED)...
    const checksum = firmarEvento(['transaction.id', 'transaction.status'], data, timestamp, SECRETO);
    // ...pero el atacante intenta colar un status distinto sin volver a firmar.
    const dataAlterada = { transaction: { ...data.transaction, status: 'DECLINED' } };
    await service.procesarWebhook({
      event: 'transaction.updated',
      data: dataAlterada,
      signature: { properties: ['transaction.id', 'transaction.status'], checksum },
      timestamp,
    });
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('actualiza la transacción a APROBADA y emite el evento realtime cuando la firma es válida', async () => {
    const data = { transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' } };
    const timestamp = 1234567890;
    const checksum = firmarEvento(['transaction.id', 'transaction.status'], data, timestamp, SECRETO);

    await service.procesarWebhook({
      event: 'transaction.updated',
      data,
      signature: { properties: ['transaction.id', 'transaction.status'], checksum },
      timestamp,
    });

    expect(transaccionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'APROBADA', wompiTransactionId: 'txn-1' }),
    );
    expect(realtimeGateway.emitToNegocio).toHaveBeenCalledWith('n1', 'pago-wompi:confirmado', {
      referencia: 'ref-abc',
    });
  });

  it('actualiza la transacción a DECLINADA y NO emite el evento realtime cuando Wompi declina el pago', async () => {
    const data = { transaction: { id: 'txn-1', status: 'DECLINED', reference: 'ref-abc' } };
    const timestamp = 1234567890;
    const checksum = firmarEvento(['transaction.id', 'transaction.status'], data, timestamp, SECRETO);

    await service.procesarWebhook({
      event: 'transaction.updated',
      data,
      signature: { properties: ['transaction.id', 'transaction.status'], checksum },
      timestamp,
    });

    expect(transaccionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'DECLINADA' }),
    );
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('ignora eventos que no son transaction.updated', async () => {
    await service.procesarWebhook({
      event: 'transaction.created',
      data: { transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' } },
      signature: { properties: ['transaction.id'], checksum: 'lo-que-sea' },
      timestamp: 1234567890,
    });
    expect(transaccionRepo.findOne).not.toHaveBeenCalled();
    expect(transaccionRepo.save).not.toHaveBeenCalled();
  });

  it('descarta el evento en silencio (sin lanzar) si signature.properties está mal formado', async () => {
    const payload = {
      event: 'transaction.updated',
      data: { transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' } },
      // properties no es un array — no debe tirar una excepción sin manejar.
      signature: { properties: 'transaction.id' as unknown as string[], checksum: 'lo-que-sea' },
      timestamp: 1234567890,
    };
    await expect(service.procesarWebhook(payload)).resolves.toBeUndefined();
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('descarta el evento si no encuentra ninguna transacción con esa referencia', async () => {
    transaccionRepo.findOne.mockResolvedValue(null);
    const data = { transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-inexistente' } };
    const timestamp = 1234567890;
    const checksum = firmarEvento(['transaction.id', 'transaction.status'], data, timestamp, SECRETO);
    await service.procesarWebhook({
      event: 'transaction.updated',
      data,
      signature: { properties: ['transaction.id', 'transaction.status'], checksum },
      timestamp,
    });
    expect(configRepo.findOne).not.toHaveBeenCalled();
    expect(transaccionRepo.save).not.toHaveBeenCalled();
    expect(realtimeGateway.emitToNegocio).not.toHaveBeenCalled();
  });

  it('descarta el evento si signature.properties no viene en el payload', async () => {
    const data = { transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' } };
    const timestamp = 1234567890;
    const checksum = firmarEvento(['transaction.id', 'transaction.status'], data, timestamp, SECRETO);
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

  it('descarta el evento si signature.properties no calza EXACTO con ["transaction.id", "transaction.status"]', async () => {
    const data = { transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' } };
    const timestamp = 1234567890;
    // Firma calculada (y válida) sobre una lista más corta que la esperada.
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
    const data = { transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' } };
    const timestamp = 1234567890;
    const checksum = firmarEvento(['transaction.id', 'transaction.status'], data, timestamp, SECRETO);
    await service.procesarWebhook({
      event: 'transaction.updated',
      data,
      signature: { properties: ['transaction.id', 'transaction.status'], checksum },
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

    const data = { transaction: { id: 'txn-1', status: 'APPROVED', reference: 'ref-abc' } };
    const timestamp = 1234567890;
    const checksum = firmarEvento(['transaction.id', 'transaction.status'], data, timestamp, SECRETO);
    const payload = {
      event: 'transaction.updated' as const,
      data,
      signature: { properties: ['transaction.id', 'transaction.status'], checksum },
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
