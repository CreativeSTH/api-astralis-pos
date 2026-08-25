import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PagosService } from './pagos.service';
import { ConfiguracionPagoWompi } from './entities/configuracion-pago-wompi.entity';

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
