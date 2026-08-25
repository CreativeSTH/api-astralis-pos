import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PagosService } from './pagos.service';
import { ConfiguracionPagoWompi } from './entities/configuracion-pago-wompi.entity';
import { TransaccionPago } from './entities/transaccion-pago.entity';
import { WompiClientService } from './wompi-client.service';
import { encriptar } from '../common/utils/cifrado';

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
