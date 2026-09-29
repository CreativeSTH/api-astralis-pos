import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FormatoImpresionService } from './formato-impresion.service';
import { Negocio } from '../negocios/entities/negocio.entity';

describe('FormatoImpresionService', () => {
  let service: FormatoImpresionService;
  let negocios: { findOne: jest.Mock; save: jest.Mock };
  let negocio: Record<string, unknown>;

  beforeEach(async () => {
    negocio = {
      id: 'neg-1',
      logoUrl: '/uploads/negocios/logos/l.png',
      mensajeCierreComprobante: null,
      terminosComprobante: 'Sin devoluciones',
    };
    negocios = {
      findOne: jest.fn(async () => negocio),
      save: jest.fn(async (n) => n),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        FormatoImpresionService,
        { provide: getRepositoryToken(Negocio), useValue: negocios },
      ],
    }).compile();
    service = moduleRef.get(FormatoImpresionService);
  });

  it('obtener: logo del negocio + mensaje y términos', async () => {
    expect(await service.obtener('neg-1')).toEqual({
      logoUrl: '/uploads/negocios/logos/l.png',
      mensajeCierre: null,
      terminos: 'Sin devoluciones',
    });
  });

  it('actualizar: recorta espacios, vacío → null, y solo toca lo que llega', async () => {
    const r = await service.actualizar('neg-1', {
      mensajeCierre: '  ¡Vuelve pronto!  ',
    });
    expect(negocios.save).toHaveBeenCalledWith(
      expect.objectContaining({
        mensajeCierreComprobante: '¡Vuelve pronto!',
        terminosComprobante: 'Sin devoluciones',
      }),
    );
    expect(r.mensajeCierre).toBe('¡Vuelve pronto!');

    await service.actualizar('neg-1', { terminos: '   ' });
    expect(negocios.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ terminosComprobante: null }),
    );
  });

  it('negocio inexistente → 404', async () => {
    negocios.findOne.mockResolvedValue(null);
    await expect(service.obtener('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
