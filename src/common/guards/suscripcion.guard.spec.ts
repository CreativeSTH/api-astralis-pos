import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { SuscripcionGuard } from './suscripcion.guard';
import { SuscripcionesService } from '../../suscripciones/suscripciones.service';

describe('SuscripcionGuard', () => {
  let guard: SuscripcionGuard;
  let suscripciones: { estadoAcceso: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  const contexto = (metodo: string, ruta: string, negocioId = 'neg-1', rolTier = 'NEGOCIO'): ExecutionContext => {
    const request = {
      user: { negocioId, rolTier },
      method: metodo,
      route: { path: ruta },
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    suscripciones = { estadoAcceso: jest.fn() };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SuscripcionGuard,
        { provide: Reflector, useValue: reflector },
        { provide: SuscripcionesService, useValue: suscripciones },
      ],
    }).compile();
    guard = moduleRef.get(SuscripcionGuard);
  });

  it("deja pasar cualquier método si el acceso es 'OK'", async () => {
    suscripciones.estadoAcceso.mockResolvedValue('OK');
    await expect(guard.canActivate(contexto('POST', '/api/ventas'))).resolves.toBe(true);
  });

  it("en 'GRACIA', deja pasar un GET fuera de la whitelist", async () => {
    suscripciones.estadoAcceso.mockResolvedValue('GRACIA');
    await expect(guard.canActivate(contexto('GET', '/api/ventas'))).resolves.toBe(true);
  });

  it("en 'GRACIA', rechaza un POST fuera de la whitelist con code SOLO_LECTURA", async () => {
    suscripciones.estadoAcceso.mockResolvedValue('GRACIA');
    await expect(guard.canActivate(contexto('POST', '/api/ventas'))).rejects.toMatchObject({
      response: { code: 'SOLO_LECTURA' },
    });
  });

  it("en 'BLOQUEADO', rechaza un GET fuera de la whitelist con code BLOQUEADO", async () => {
    suscripciones.estadoAcceso.mockResolvedValue('BLOQUEADO');
    await expect(guard.canActivate(contexto('GET', '/api/ventas'))).rejects.toMatchObject({
      response: { code: 'BLOQUEADO' },
    });
  });

  it("en 'BLOQUEADO', deja pasar una ruta de la whitelist (ej. reactivar)", async () => {
    suscripciones.estadoAcceso.mockResolvedValue('BLOQUEADO');
    await expect(guard.canActivate(contexto('POST', '/api/suscripcion/reactivar'))).resolves.toBe(true);
  });

  it('no aplica a un usuario de tier SISTEMA', async () => {
    await expect(guard.canActivate(contexto('POST', '/api/negocios', undefined, 'SISTEMA'))).resolves.toBe(true);
    expect(suscripciones.estadoAcceso).not.toHaveBeenCalled();
  });
});
