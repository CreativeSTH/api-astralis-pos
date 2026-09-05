import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OnboardingService } from './onboarding.service';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { HabilitacionFacturacionElectronica } from '../facturacion-electronica/entities/habilitacion-facturacion-electronica.entity';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let sucursalRepository: { count: jest.Mock };
  let ventaRepository: { count: jest.Mock };
  let habilitacionRepository: { findOne: jest.Mock };
  let suscripcionesService: { tieneFeature: jest.Mock };

  beforeEach(async () => {
    sucursalRepository = { count: jest.fn() };
    ventaRepository = { count: jest.fn() };
    habilitacionRepository = { findOne: jest.fn() };
    suscripcionesService = { tieneFeature: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: getRepositoryToken(Sucursal), useValue: sucursalRepository },
        { provide: getRepositoryToken(Venta), useValue: ventaRepository },
        { provide: getRepositoryToken(HabilitacionFacturacionElectronica), useValue: habilitacionRepository },
        { provide: SuscripcionesService, useValue: suscripcionesService },
      ],
    }).compile();
    service = moduleRef.get(OnboardingService);
  });

  it('facturacionDian es NO_APLICA si el paquete no la incluye', async () => {
    sucursalRepository.count.mockResolvedValue(1);
    ventaRepository.count.mockResolvedValue(0);
    suscripcionesService.tieneFeature.mockResolvedValue(false);

    const resultado = await service.obtenerEstado('neg-1');

    expect(resultado.facturacionDian).toBe('NO_APLICA');
    expect(habilitacionRepository.findOne).not.toHaveBeenCalled();
  });

  it('facturacionDian es PENDIENTE si el paquete la incluye pero no está HABILITADO', async () => {
    sucursalRepository.count.mockResolvedValue(1);
    ventaRepository.count.mockResolvedValue(1);
    suscripcionesService.tieneFeature.mockResolvedValue(true);
    habilitacionRepository.findOne.mockResolvedValue({ estado: 'RESOLUCION_CARGADA' });

    const resultado = await service.obtenerEstado('neg-1');

    expect(resultado.facturacionDian).toBe('PENDIENTE');
  });

  it('facturacionDian es LISTO si está HABILITADO', async () => {
    sucursalRepository.count.mockResolvedValue(1);
    ventaRepository.count.mockResolvedValue(1);
    suscripcionesService.tieneFeature.mockResolvedValue(true);
    habilitacionRepository.findOne.mockResolvedValue({ estado: 'HABILITADO' });

    const resultado = await service.obtenerEstado('neg-1');

    expect(resultado.facturacionDian).toBe('LISTO');
  });

  it('sucursalConfigurada y primeraVentaRealizada reflejan los counts', async () => {
    sucursalRepository.count.mockResolvedValue(0);
    ventaRepository.count.mockResolvedValue(0);
    suscripcionesService.tieneFeature.mockResolvedValue(false);

    const resultado = await service.obtenerEstado('neg-1');

    expect(resultado.sucursalConfigurada).toBe(false);
    expect(resultado.primeraVentaRealizada).toBe(false);
  });
});
