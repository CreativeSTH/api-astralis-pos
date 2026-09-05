import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { EmailVerificadoGuard } from './email-verificado.guard';
import { Usuario } from '../../usuarios/entities/usuario.entity';

describe('EmailVerificadoGuard', () => {
  let guard: EmailVerificadoGuard;
  let usuariosRepository: { findOne: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  const contextoConBody = (body: Record<string, unknown>): ExecutionContext => {
    const request = { user: { sub: 'u1' }, body };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    usuariosRepository = { findOne: jest.fn() };
    reflector = { getAllAndOverride: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailVerificadoGuard,
        { provide: getRepositoryToken(Usuario), useValue: usuariosRepository },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();
    guard = moduleRef.get(EmailVerificadoGuard);
  });

  it('deja pasar cuando el endpoint no tiene el decorator', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(contextoConBody({}))).resolves.toBe(true);
    expect(usuariosRepository.findOne).not.toHaveBeenCalled();
  });

  it('rechaza cuando la metadata exige siempre y el usuario no verificó', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    usuariosRepository.findOne.mockResolvedValue({ emailVerificado: false });

    await expect(guard.canActivate(contextoConBody({}))).rejects.toThrow(ForbiddenException);
  });

  it('deja pasar cuando la metadata exige condicionalmente y el campo no viene', async () => {
    reflector.getAllAndOverride.mockReturnValue('guardarTarjeta');
    usuariosRepository.findOne.mockResolvedValue({ emailVerificado: false });

    await expect(guard.canActivate(contextoConBody({ guardarTarjeta: false }))).resolves.toBe(true);
  });

  it('rechaza cuando la metadata exige condicionalmente y el campo viene en true', async () => {
    reflector.getAllAndOverride.mockReturnValue('guardarTarjeta');
    usuariosRepository.findOne.mockResolvedValue({ emailVerificado: false });

    await expect(guard.canActivate(contextoConBody({ guardarTarjeta: true }))).rejects.toThrow(ForbiddenException);
  });

  it('deja pasar siempre que el usuario ya verificó, sin importar la metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    usuariosRepository.findOne.mockResolvedValue({ emailVerificado: true });

    await expect(guard.canActivate(contextoConBody({}))).resolves.toBe(true);
  });
});
