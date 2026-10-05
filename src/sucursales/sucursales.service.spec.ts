import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { SucursalesService } from './sucursales.service';
import { Sucursal } from './entities/sucursal.entity';
import { Bodega } from '../bodegas/entities/bodega.entity';

describe('SucursalesService — bodega operativa', () => {
  let service: SucursalesService;
  let bodegaFindOne: jest.Mock;
  let repo: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    bodegaFindOne = jest.fn();
    repo = {
      findOne: jest.fn().mockResolvedValue({ id: 'suc-1', negocioId: 'negocio-1', nombre: 'Centro' }),
      save: jest.fn(async (x) => x),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SucursalesService,
        { provide: getRepositoryToken(Sucursal), useValue: repo },
        {
          provide: getRepositoryToken(Bodega),
          useValue: { manager: { getRepository: () => ({ findOne: bodegaFindOne }) } },
        },
        { provide: ClsService, useValue: { get: jest.fn().mockReturnValue('negocio-1') } },
      ],
    }).compile();
    service = moduleRef.get(SucursalesService);
  });

  it('acepta como operativa una bodega compartida asociada a la sucursal', async () => {
    bodegaFindOne.mockResolvedValue({ id: 'bod-compartida' });
    await service.update('suc-1', { bodegaOperativaId: 'bod-compartida' });
    expect(bodegaFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sucursales: { id: 'suc-1' } }) }),
    );
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ bodegaOperativaId: 'bod-compartida' }));
  });

  it('rechaza como operativa una bodega no asociada (o un CEDI)', async () => {
    bodegaFindOne.mockResolvedValue(null);
    await expect(service.update('suc-1', { bodegaOperativaId: 'bod-cedi' })).rejects.toThrow(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
