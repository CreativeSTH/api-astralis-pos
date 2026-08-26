import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { BodegasService } from './bodegas.service';
import { Bodega } from './entities/bodega.entity';
import { TiendaOnlineService } from '../tienda-online/tienda-online.service';

describe('BodegasService — bloqueo por tienda online', () => {
  let service: BodegasService;
  let repo: { findOne: jest.Mock; save: jest.Mock };
  let tiendaOnlineService: { estaUsadaPorTiendaActiva: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn().mockResolvedValue({ id: 'bodega-1', negocioId: 'negocio-1', activo: true }),
      save: jest.fn((x) => x),
    };
    tiendaOnlineService = { estaUsadaPorTiendaActiva: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        BodegasService,
        { provide: getRepositoryToken(Bodega), useValue: repo },
        { provide: TiendaOnlineService, useValue: tiendaOnlineService },
        { provide: ClsService, useValue: { get: jest.fn().mockReturnValue('negocio-1') } },
      ],
    }).compile();
    service = moduleRef.get(BodegasService);
  });

  it('rechaza desactivar una bodega en uso por una tienda online activa', async () => {
    tiendaOnlineService.estaUsadaPorTiendaActiva.mockResolvedValue(true);
    await expect(service.remove('bodega-1')).rejects.toThrow(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('permite desactivar una bodega libre', async () => {
    tiendaOnlineService.estaUsadaPorTiendaActiva.mockResolvedValue(false);
    await service.remove('bodega-1');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ activo: false }));
  });
});
