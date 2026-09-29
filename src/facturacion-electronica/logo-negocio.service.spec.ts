import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LogoNegocioService } from './logo-negocio.service';
import { Negocio } from '../negocios/entities/negocio.entity';
import { PlantillaComprobante } from '../facturacion/entities/plantilla-comprobante.entity';
import { TiendaOnline } from '../tienda-online/entities/tienda-online.entity';

describe('LogoNegocioService — cascada de logos del PDF', () => {
  let service: LogoNegocioService;
  let negocios: { findOne: jest.Mock };
  let plantillas: { findOne: jest.Mock };
  let tiendas: { findOne: jest.Mock };
  let leer: jest.SpyInstance;

  beforeEach(async () => {
    negocios = { findOne: jest.fn().mockResolvedValue({ logoUrl: '/uploads/negocios/logos/n.png' }) };
    plantillas = { findOne: jest.fn().mockResolvedValue({ logoUrl: '/uploads/plantillas/p.png' }) };
    tiendas = { findOne: jest.fn().mockResolvedValue({ logoUrl: '/uploads/tienda-online/logos/t.png' }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        LogoNegocioService,
        { provide: getRepositoryToken(Negocio), useValue: negocios },
        { provide: getRepositoryToken(PlantillaComprobante), useValue: plantillas },
        { provide: getRepositoryToken(TiendaOnline), useValue: tiendas },
      ],
    }).compile();
    service = moduleRef.get(LogoNegocioService);
    leer = jest.spyOn(service as any, 'leer');
  });

  it('usa el logo del negocio si existe', async () => {
    leer.mockImplementation(async (url: string) => Buffer.from(url));
    expect((await service.resolverLogo('neg-1'))!.toString()).toBe('/uploads/negocios/logos/n.png');
  });

  it('si el archivo del negocio no existe, cae a la plantilla FACTURA predeterminada', async () => {
    leer.mockImplementation(async (url: string) => (url.includes('negocios') ? null : Buffer.from(url)));
    expect((await service.resolverLogo('neg-1'))!.toString()).toBe('/uploads/plantillas/p.png');
    expect(plantillas.findOne).toHaveBeenCalledWith({
      where: { negocioId: 'neg-1', tipo: 'FACTURA', esPredeterminada: true, activo: true },
    });
  });

  it('sin logo de negocio ni plantilla, usa el de la tienda online', async () => {
    negocios.findOne.mockResolvedValue({ logoUrl: null });
    plantillas.findOne.mockResolvedValue(null);
    leer.mockImplementation(async (url: string) => Buffer.from(url));
    expect((await service.resolverLogo('neg-1'))!.toString()).toBe('/uploads/tienda-online/logos/t.png');
  });

  it('devuelve null si no hay ningún logo', async () => {
    negocios.findOne.mockResolvedValue({ logoUrl: null });
    plantillas.findOne.mockResolvedValue(null);
    tiendas.findOne.mockResolvedValue(null);
    expect(await service.resolverLogo('neg-1')).toBeNull();
  });

  it('no lee archivos fuera de uploads (path traversal)', async () => {
    leer.mockRestore();
    expect(await (service as any).leer('/uploads/../.env')).toBeNull();
  });
});
