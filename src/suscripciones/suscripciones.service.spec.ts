import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SuscripcionesService } from './suscripciones.service';
import { Suscripcion } from './entities/suscripcion.entity';
import { EstadoSuscripcion } from './entities/estado-suscripcion.enum';
import { TransaccionSuscripcion } from './entities/transaccion-suscripcion.entity';
import { WompiClientService } from '../pagos/wompi-client.service';
import { PaquetesService } from '../paquetes/paquetes.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

describe('SuscripcionesService — creación y estaBloqueado', () => {
  let service: SuscripcionesService;
  let suscripcionesRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    suscripcionesRepo = { findOne: jest.fn(), create: jest.fn((x) => x), save: jest.fn(async (x) => x) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionesService,
        { provide: getRepositoryToken(Suscripcion), useValue: suscripcionesRepo },
        { provide: getRepositoryToken(TransaccionSuscripcion), useValue: {} },
        { provide: WompiClientService, useValue: {} },
        { provide: PaquetesService, useValue: {} },
        { provide: RealtimeGateway, useValue: { emitToNegocio: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(SuscripcionesService);
  });

  it('crearSuscripcionPrueba pone fechaFin 20 días después de fechaInicio', async () => {
    await service.crearSuscripcionPrueba('neg-1', 'pro-1');
    const guardado = suscripcionesRepo.save.mock.calls[0][0] as Suscripcion;
    expect(guardado.estado).toBe(EstadoSuscripcion.PRUEBA);
    const diffDias = (guardado.fechaFin!.getTime() - guardado.fechaInicio.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDias).toBeCloseTo(20, 1);
  });

  it('crearSuscripcionSinVencimiento crea en ACTIVA con fechaFin null', async () => {
    await service.crearSuscripcionSinVencimiento('neg-1', 'free-1');
    const guardado = suscripcionesRepo.save.mock.calls[0][0] as Suscripcion;
    expect(guardado.estado).toBe(EstadoSuscripcion.ACTIVA);
    expect(guardado.fechaFin).toBeNull();
  });

  describe('estaBloqueado', () => {
    it('true si no hay ninguna Suscripcion para el negocio (fail-closed)', async () => {
      suscripcionesRepo.findOne.mockResolvedValue(null);
      expect(await service.estaBloqueado('neg-sin-suscripcion')).toBe(true);
    });

    it('true si el estado es VENCIDA', async () => {
      suscripcionesRepo.findOne.mockResolvedValue({ estado: EstadoSuscripcion.VENCIDA, fechaFin: null });
      expect(await service.estaBloqueado('neg-1')).toBe(true);
    });

    it('false si el estado es PRUEBA o ACTIVA con fechaFin futura (o sin vencimiento)', async () => {
      const fechaFutura = new Date(Date.now() + 24 * 60 * 60 * 1000);
      suscripcionesRepo.findOne.mockResolvedValue({ estado: EstadoSuscripcion.PRUEBA, fechaFin: fechaFutura });
      expect(await service.estaBloqueado('neg-1')).toBe(false);
      suscripcionesRepo.findOne.mockResolvedValue({ estado: EstadoSuscripcion.ACTIVA, fechaFin: null });
      expect(await service.estaBloqueado('neg-1')).toBe(false);
    });

    it('true si estado es PRUEBA/ACTIVA pero fechaFin ya pasó — no depende de que el cron haya corrido', async () => {
      const fechaPasada = new Date(Date.now() - 24 * 60 * 60 * 1000);
      suscripcionesRepo.findOne.mockResolvedValue({ estado: EstadoSuscripcion.PRUEBA, fechaFin: fechaPasada });
      expect(await service.estaBloqueado('neg-1')).toBe(true);
      suscripcionesRepo.findOne.mockResolvedValue({ estado: EstadoSuscripcion.ACTIVA, fechaFin: fechaPasada });
      expect(await service.estaBloqueado('neg-1')).toBe(true);
    });
  });
});
