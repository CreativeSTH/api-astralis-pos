import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { In, IsNull } from 'typeorm';
import { BodegasService } from './bodegas.service';
import { Bodega } from './entities/bodega.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { TiendaOnlineService } from '../tienda-online/tienda-online.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Traslado } from '../traslados/entities/traslado.entity';
import { EstadoTraslado } from '../common/enums/estado-traslado.enum';

describe('BodegasService', () => {
  let service: BodegasService;
  let repo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let sucursalRepo: { find: jest.Mock; findOne: jest.Mock; update: jest.Mock; exists: jest.Mock };
  let tiendaOnlineService: { estaUsadaPorTiendaActiva: jest.Mock };
  let auditoria: { registrarRelacionesMultiples: jest.Mock };
  let trasladoRepo: { exists: jest.Mock };

  const suc = (id: string, nombre = id) => ({ id, nombre, negocioId: 'negocio-1' });

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue({ id: 'bodega-1', negocioId: 'negocio-1', nombre: 'Principal', activo: true, sucursales: [] }),
      save: jest.fn(async (x) => ({ id: x.id ?? 'bodega-nueva', ...x })),
      create: jest.fn((x) => x),
    };
    sucursalRepo = {
      find: jest.fn(async ({ where }) => (where.id.value as string[]).filter((id) => id !== 'ajena').map((id) => suc(id))),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      exists: jest.fn().mockResolvedValue(false),
    };
    tiendaOnlineService = { estaUsadaPorTiendaActiva: jest.fn().mockResolvedValue(false) };
    auditoria = { registrarRelacionesMultiples: jest.fn() };
    trasladoRepo = { exists: jest.fn().mockResolvedValue(false) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        BodegasService,
        { provide: getRepositoryToken(Bodega), useValue: repo },
        { provide: getRepositoryToken(Sucursal), useValue: sucursalRepo },
        { provide: getRepositoryToken(Traslado), useValue: trasladoRepo },
        { provide: TiendaOnlineService, useValue: tiendaOnlineService },
        { provide: AuditoriaService, useValue: auditoria },
        { provide: ClsService, useValue: { get: jest.fn().mockReturnValue('negocio-1') } },
      ],
    }).compile();
    service = moduleRef.get(BodegasService);
  });

  describe('create', () => {
    it('sin sucursales crea un CEDI y no toca ninguna operativa', async () => {
      const r = await service.create({ nombre: 'CEDI', sucursalIds: [] });
      expect(r.sucursalIds).toEqual([]);
      expect(sucursalRepo.update).not.toHaveBeenCalled();
    });

    it('con varias sucursales la deja como operativa de las que no tienen una', async () => {
      const r = await service.create({ nombre: 'Compartida', sucursalIds: ['s1', 's2'] });
      expect(r.sucursalIds).toEqual(['s1', 's2']);
      expect(sucursalRepo.update).toHaveBeenCalledWith(
        { id: In(['s1', 's2']), negocioId: 'negocio-1', bodegaOperativaId: IsNull() },
        { bodegaOperativaId: 'bodega-nueva' },
      );
    });

    it('rechaza una sucursal de otro negocio', async () => {
      await expect(service.create({ nombre: 'X', sucursalIds: ['s1', 'ajena'] })).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('no deja quitar una sucursal donde la bodega es la operativa', async () => {
      repo.findOne.mockResolvedValue({ id: 'bodega-1', negocioId: 'negocio-1', nombre: 'P', activo: true, sucursales: [suc('s1'), suc('s2')] });
      sucursalRepo.findOne.mockResolvedValue(suc('s2', 'Norte'));
      await expect(service.update('bodega-1', { sucursalIds: ['s1'] })).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('al agregar una sucursal audita el cambio y solo asigna operativa a la nueva', async () => {
      repo.findOne.mockResolvedValue({ id: 'bodega-1', negocioId: 'negocio-1', nombre: 'P', activo: true, sucursales: [suc('s1')] });
      const r = await service.update('bodega-1', { sucursalIds: ['s1', 's2'] });
      expect(r.sucursalIds).toEqual(['s1', 's2']);
      expect(auditoria.registrarRelacionesMultiples).toHaveBeenCalledWith(
        Bodega,
        expect.objectContaining({ sucursales: [suc('s1')] }),
        expect.objectContaining({ sucursales: [suc('s1'), suc('s2')] }),
      );
      expect(sucursalRepo.update).toHaveBeenCalledWith(
        { id: In(['s2']), negocioId: 'negocio-1', bodegaOperativaId: IsNull() },
        { bodegaOperativaId: 'bodega-1' },
      );
    });

    it('solo el nombre: no toca sucursales ni audita relaciones', async () => {
      await service.update('bodega-1', { nombre: 'Nueva' });
      expect(auditoria.registrarRelacionesMultiples).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Nueva', sucursales: [] }));
    });
  });

  describe('findAll', () => {
    it('filtrado por sucursal devuelve las bodegas con TODAS sus sucursales', async () => {
      repo.find
        .mockResolvedValueOnce([{ id: 'bodega-1' }])
        .mockResolvedValueOnce([{ id: 'bodega-1', nombre: 'P', activo: true, sucursales: [suc('s1'), suc('s2')] }]);
      const r = await service.findAll('s1');
      expect(r).toEqual([expect.objectContaining({ id: 'bodega-1', sucursalIds: ['s1', 's2'] })]);
      expect(repo.find.mock.calls[0][0].where).toEqual(expect.objectContaining({ sucursales: { id: 's1' } }));
    });

    it('sin bodegas en la sucursal devuelve vacío sin segunda consulta', async () => {
      repo.find.mockResolvedValueOnce([]);
      expect(await service.findAll('s9')).toEqual([]);
      expect(repo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove — bloqueos', () => {
    it('rechaza desactivar una bodega en uso por una tienda online activa', async () => {
      tiendaOnlineService.estaUsadaPorTiendaActiva.mockResolvedValue(true);
      await expect(service.remove('bodega-1')).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rechaza desactivar una bodega con traslados en tránsito (como origen o destino)', async () => {
      trasladoRepo.exists.mockResolvedValue(true);
      await expect(service.remove('bodega-1')).rejects.toThrow('traslados en tránsito');
      expect(trasladoRepo.exists).toHaveBeenCalledWith({
        where: [
          { negocioId: 'negocio-1', estado: EstadoTraslado.EN_TRANSITO, bodegaOrigenId: 'bodega-1' },
          { negocioId: 'negocio-1', estado: EstadoTraslado.EN_TRANSITO, bodegaDestinoId: 'bodega-1' },
        ],
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('permite desactivar una bodega libre', async () => {
      await service.remove('bodega-1');
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ activo: false }));
    });
  });
});
