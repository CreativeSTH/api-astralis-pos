import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TiendaOnlineService } from './tienda-online.service';
import { TiendaOnline } from './entities/tienda-online.entity';
import { Bodega } from '../bodegas/entities/bodega.entity';

describe('TiendaOnlineService', () => {
  let service: TiendaOnlineService;
  let tiendaRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let bodegaRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    tiendaRepo = { findOne: jest.fn(), save: jest.fn((x) => x), create: jest.fn((x) => x) };
    bodegaRepo = { findOne: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TiendaOnlineService,
        { provide: getRepositoryToken(TiendaOnline), useValue: tiendaRepo },
        { provide: getRepositoryToken(Bodega), useValue: bodegaRepo },
        { provide: ClsService, useValue: { get: jest.fn().mockReturnValue('negocio-1') } },
      ],
    }).compile();
    service = moduleRef.get(TiendaOnlineService);
  });

  it('no permite activar sin bodega elegida', async () => {
    tiendaRepo.findOne.mockResolvedValue({ negocioId: 'negocio-1', bodegaId: null, activo: false });
    await expect(service.activar()).rejects.toThrow(BadRequestException);
  });

  it('activa cuando ya hay bodega elegida', async () => {
    tiendaRepo.findOne.mockResolvedValue({ negocioId: 'negocio-1', bodegaId: 'bodega-1', activo: false });
    await service.activar();
    expect(tiendaRepo.save).toHaveBeenCalledWith(expect.objectContaining({ activo: true }));
  });

  it('rechaza elegir una bodega que no existe o es de otro negocio', async () => {
    bodegaRepo.findOne.mockResolvedValue(null);
    tiendaRepo.findOne.mockResolvedValue(null);
    await expect(service.elegirBodega('bodega-ajena')).rejects.toThrow(NotFoundException);
  });

  it('guarda la bodega cuando pertenece al negocio actual', async () => {
    bodegaRepo.findOne.mockResolvedValue({ id: 'bodega-1', negocioId: 'negocio-1', activo: true });
    tiendaRepo.findOne.mockResolvedValue(null);
    await service.elegirBodega('bodega-1');
    expect(tiendaRepo.save).toHaveBeenCalledWith(expect.objectContaining({ bodegaId: 'bodega-1' }));
  });

  it('estaUsadaPorTiendaActiva es true si la bodega es la de una tienda activa', async () => {
    tiendaRepo.findOne.mockResolvedValue({ negocioId: 'negocio-1', bodegaId: 'bodega-1', activo: true });
    await expect(service.estaUsadaPorTiendaActiva('bodega-1')).resolves.toBe(true);
  });

  it('estaUsadaPorTiendaActiva es false si la tienda no está activa', async () => {
    tiendaRepo.findOne.mockResolvedValue(null);
    await expect(service.estaUsadaPorTiendaActiva('bodega-1')).resolves.toBe(false);
  });

  it('obtenerConfiguracionPublica devuelve la config de un negocio sin depender del contexto CLS', async () => {
    tiendaRepo.findOne.mockResolvedValue({ negocioId: 'negocio-2', bodegaId: 'bodega-9', activo: true });
    const config = await service.obtenerConfiguracionPublica('negocio-2');
    expect(config).toEqual({
      bodegaId: 'bodega-9', activo: true, plantilla: 'aurora',
      logoUrl: null, banners: [], terminos: null, tratamientoDatos: null, politicaEnvios: null,
    });
    expect(tiendaRepo.findOne).toHaveBeenCalledWith({ where: { negocioId: 'negocio-2' } });
  });

  it('obtenerConfiguracionPublica devuelve inactivo/sin bodega si el negocio no tiene TiendaOnline creada', async () => {
    tiendaRepo.findOne.mockResolvedValue(null);
    const config = await service.obtenerConfiguracionPublica('negocio-sin-tienda');
    expect(config).toEqual({
      bodegaId: null, activo: false, plantilla: 'aurora',
      logoUrl: null, banners: [], terminos: null, tratamientoDatos: null, politicaEnvios: null,
    });
  });

  it('obtenerConfiguracion devuelve plantilla por defecto (aurora) cuando todavía no se eligió ninguna', async () => {
    tiendaRepo.findOne.mockResolvedValue({
      negocioId: 'negocio-1', bodegaId: 'bodega-1', activo: true,
      plantilla: null, logoUrl: null, banners: [], terminos: null, tratamientoDatos: null, politicaEnvios: null,
    });
    const config = await service.obtenerConfiguracion();
    expect(config.plantilla).toBe('aurora');
  });

  it('obtenerConfiguracion respeta la plantilla ya elegida', async () => {
    tiendaRepo.findOne.mockResolvedValue({
      negocioId: 'negocio-1', bodegaId: 'bodega-1', activo: true,
      plantilla: 'meadow', logoUrl: '/uploads/tienda-online/logos/a.png', banners: ['/uploads/x.png'],
      terminos: 'Términos', tratamientoDatos: null, politicaEnvios: null,
    });
    const config = await service.obtenerConfiguracion();
    expect(config).toEqual({
      bodegaId: 'bodega-1', activo: true, plantilla: 'meadow',
      logoUrl: '/uploads/tienda-online/logos/a.png', banners: ['/uploads/x.png'],
      terminos: 'Términos', tratamientoDatos: null, politicaEnvios: null,
    });
  });

  it('actualizarPlantilla guarda la plantilla elegida', async () => {
    tiendaRepo.findOne.mockResolvedValue({ negocioId: 'negocio-1', bodegaId: 'bodega-1', activo: true });
    await service.actualizarPlantilla('foundry' as any);
    expect(tiendaRepo.save).toHaveBeenCalledWith(expect.objectContaining({ plantilla: 'foundry' }));
  });

  it('actualizarLegales guarda solo los campos provistos, sin tocar los demás', async () => {
    tiendaRepo.findOne.mockResolvedValue({
      negocioId: 'negocio-1', bodegaId: 'bodega-1', activo: true,
      terminos: 'viejo', tratamientoDatos: 'viejo-2', politicaEnvios: 'viejo-3',
    });
    await service.actualizarLegales({ terminos: 'nuevo' });
    expect(tiendaRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      terminos: 'nuevo', tratamientoDatos: 'viejo-2', politicaEnvios: 'viejo-3',
    }));
  });
});
