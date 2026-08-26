import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CatalogoPublicoService } from './catalogo-publico.service';
import { Inventario } from '../inventario/entities/inventario.entity';
import { TiendaOnlineService } from '../tienda-online/tienda-online.service';

describe('CatalogoPublicoService', () => {
  let service: CatalogoPublicoService;
  let inventarioRepo: { createQueryBuilder: jest.Mock };
  let tiendaOnlineService: { obtenerConfiguracionPublica: jest.Mock };
  let queryBuilder: any;

  beforeEach(async () => {
    queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };
    inventarioRepo = { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) };
    tiendaOnlineService = { obtenerConfiguracionPublica: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogoPublicoService,
        { provide: getRepositoryToken(Inventario), useValue: inventarioRepo },
        { provide: TiendaOnlineService, useValue: tiendaOnlineService },
      ],
    }).compile();
    service = moduleRef.get(CatalogoPublicoService);
  });

  it('devuelve activa=false y catalogo vacio si la tienda no esta activa', async () => {
    tiendaOnlineService.obtenerConfiguracionPublica.mockResolvedValue({ bodegaId: 'bodega-1', activo: false });
    const resultado = await service.obtenerCatalogo('negocio-1');
    expect(resultado).toEqual({ activa: false, productos: [] });
    expect(inventarioRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('devuelve activa=false y catalogo vacio si no hay bodega asignada', async () => {
    tiendaOnlineService.obtenerConfiguracionPublica.mockResolvedValue({ bodegaId: null, activo: true });
    const resultado = await service.obtenerCatalogo('negocio-1');
    expect(resultado).toEqual({ activa: false, productos: [] });
  });

  it('devuelve el catalogo derivado del stock de la bodega designada cuando la tienda esta activa', async () => {
    tiendaOnlineService.obtenerConfiguracionPublica.mockResolvedValue({ bodegaId: 'bodega-1', activo: true });
    queryBuilder.getMany.mockResolvedValue([
      {
        cantidad: 5,
        producto: {
          id: 'prod-1',
          nombre: 'Coca Cola 400ml',
          descripcion: null,
          precioVenta: '2500.00',
          porcentajeImpuesto: '19.00',
          imagenUrl: null,
          activo: true,
        },
      },
    ]);
    const resultado = await service.obtenerCatalogo('negocio-1');
    expect(resultado.activa).toBe(true);
    expect(resultado.productos).toEqual([
      {
        id: 'prod-1',
        nombre: 'Coca Cola 400ml',
        descripcion: null,
        precioVenta: 2500,
        porcentajeImpuesto: 19,
        imagenUrl: null,
      },
    ]);
    expect(queryBuilder.where).toHaveBeenCalledWith('inv.negocio_id = :negocioId', { negocioId: 'negocio-1' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('inv.bodega_id = :bodegaId', { bodegaId: 'bodega-1' });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('inv.cantidad > 0');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('producto.activo = true');
  });

  it('incluye plantilla, logo, banners y legales cuando la tienda esta activa', async () => {
    tiendaOnlineService.obtenerConfiguracionPublica.mockResolvedValue({
      bodegaId: 'bodega-1', activo: true, plantilla: 'nocturne', logoUrl: '/logo.png',
      banners: ['/b1.png'], terminos: 'T', tratamientoDatos: 'D', politicaEnvios: 'E',
    });
    queryBuilder.getMany.mockResolvedValue([]);
    const resultado = await service.obtenerCatalogo('negocio-1');
    expect(resultado).toEqual({
      activa: true, productos: [], plantilla: 'nocturne', logoUrl: '/logo.png',
      banners: ['/b1.png'], terminos: 'T', tratamientoDatos: 'D', politicaEnvios: 'E',
    });
  });

  it('incluye plantilla por defecto aunque la tienda este inactiva', async () => {
    tiendaOnlineService.obtenerConfiguracionPublica.mockResolvedValue({
      bodegaId: null, activo: false, plantilla: 'aurora', logoUrl: null,
      banners: [], terminos: null, tratamientoDatos: null, politicaEnvios: null,
    });
    const resultado = await service.obtenerCatalogo('negocio-1');
    expect(resultado.plantilla).toBe('aurora');
    expect(resultado.activa).toBe(false);
  });
});
