import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PaquetesService } from './paquetes.service';
import { Paquete } from './entities/paquete.entity';

describe('PaquetesService', () => {
  let service: PaquetesService;
  let paquetesRepo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock };

  const paqueteFree: Paquete = {
    id: 'free-1',
    nombre: 'Free',
    precioMensual: 0,
    facturacionDianHabilitada: false,
    documentosDianPorMes: 0,
    tiendaOnlineHabilitada: false,
    maxSucursales: 0,
    maxUsuarios: 0,
    esPaqueteFree: true,
    activo: true,
  } as Paquete;

  const paquetePro: Paquete = {
    id: 'pro-1',
    nombre: 'Profesional',
    precioMensual: 139900,
    facturacionDianHabilitada: true,
    documentosDianPorMes: 100,
    tiendaOnlineHabilitada: true,
    maxSucursales: 3,
    maxUsuarios: 10,
    esPaqueteFree: false,
    activo: true,
  } as Paquete;

  beforeEach(async () => {
    paquetesRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      update: jest.fn(async () => ({ affected: 1 })),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PaquetesService, { provide: getRepositoryToken(Paquete), useValue: paquetesRepo }],
    }).compile();

    service = moduleRef.get(PaquetesService);
  });

  describe('asegurarPaqueteFreePorDefecto', () => {
    it('devuelve el FREE existente sin crear uno nuevo', async () => {
      paquetesRepo.findOne.mockResolvedValue(paqueteFree);
      const resultado = await service.asegurarPaqueteFreePorDefecto();
      expect(resultado).toBe(paqueteFree);
      expect(paquetesRepo.save).not.toHaveBeenCalled();
    });

    it('crea el FREE si no existe todavía', async () => {
      paquetesRepo.findOne.mockResolvedValue(null);
      await service.asegurarPaqueteFreePorDefecto();
      expect(paquetesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ esPaqueteFree: true, facturacionDianHabilitada: false }),
      );
    });
  });

  describe('remove', () => {
    it('rechaza desactivar el paquete FREE', async () => {
      paquetesRepo.findOne.mockResolvedValue(paqueteFree);
      await expect(service.remove('free-1')).rejects.toThrow(BadRequestException);
      expect(paquetesRepo.save).not.toHaveBeenCalled();
    });

    it('desactiva un paquete normal', async () => {
      paquetesRepo.findOne.mockResolvedValue(paquetePro);
      await service.remove('pro-1');
      expect(paquetesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ activo: false }));
    });
  });

  describe('create', () => {
    it('nunca deja marcar esPaqueteFree desde el DTO público', async () => {
      await service.create({
        nombre: 'Empresarial',
        precioMensual: 219900,
        facturacionDianHabilitada: true,
        documentosDianPorMes: 500,
        tiendaOnlineHabilitada: true,
        maxSucursales: 10,
        maxUsuarios: 50,
      });
      expect(paquetesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ esPaqueteFree: false }));
    });
  });

  describe('update — esPaqueteTrialCompleto', () => {
    it('al marcar un paquete como trial completo, desmarca cualquier otro que lo tuviera antes', async () => {
      paquetesRepo.findOne.mockResolvedValue(paquetePro);
      await service.update('pro-1', { esPaqueteTrialCompleto: true });
      expect(paquetesRepo.update).toHaveBeenCalledWith(
        { esPaqueteTrialCompleto: true },
        { esPaqueteTrialCompleto: false },
      );
      expect(paquetesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ esPaqueteTrialCompleto: true }));
    });

    it('no toca la exclusividad si el update no incluye esPaqueteTrialCompleto', async () => {
      paquetesRepo.findOne.mockResolvedValue(paquetePro);
      await service.update('pro-1', { precioMensual: 150000 });
      expect(paquetesRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('obtenerPaqueteTrialCompleto', () => {
    it('devuelve el paquete marcado', async () => {
      const paqueteEmpresarial = { ...paquetePro, id: 'emp-1', esPaqueteTrialCompleto: true };
      paquetesRepo.findOne.mockResolvedValue(paqueteEmpresarial);
      const resultado = await service.obtenerPaqueteTrialCompleto();
      expect(resultado).toBe(paqueteEmpresarial);
    });

    it('lanza si ningún paquete está marcado', async () => {
      paquetesRepo.findOne.mockResolvedValue(null);
      await expect(service.obtenerPaqueteTrialCompleto()).rejects.toThrow(InternalServerErrorException);
    });
  });
});
