import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ClienteAuthService } from './cliente-auth.service';
import { Cliente } from '../clientes/entities/cliente.entity';

describe('ClienteAuthService', () => {
  let service: ClienteAuthService;
  let clienteRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    clienteRepo = { findOne: jest.fn(), save: jest.fn((x) => x), create: jest.fn((x) => x) };
    jwtService = { sign: jest.fn().mockReturnValue('token-firmado') };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClienteAuthService,
        { provide: getRepositoryToken(Cliente), useValue: clienteRepo },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();
    service = moduleRef.get(ClienteAuthService);
  });

  it('crea un cliente nuevo si el telefono no existe todavia', async () => {
    clienteRepo.findOne.mockResolvedValue(null);
    const resultado = await service.registrar('negocio-1', { nombre: 'Ana', telefono: '3001234567', password: 'clave123' });
    expect(resultado.accessToken).toBe('token-firmado');
    expect(clienteRepo.save).toHaveBeenCalled();
    const guardado = clienteRepo.save.mock.calls[0][0];
    expect(guardado.passwordHash).toBeDefined();
    expect(guardado.passwordHash).not.toBe('clave123');
  });

  it('reclama la cuenta si el cliente existe pero no tiene passwordHash', async () => {
    clienteRepo.findOne.mockResolvedValue({ id: 'cliente-1', negocioId: 'negocio-1', nombre: 'Ana Vieja', telefono: '3001234567', email: null, passwordHash: null });
    const resultado = await service.registrar('negocio-1', { nombre: 'Ana', telefono: '3001234567', password: 'clave123' });
    expect(resultado.cliente.id).toBe('cliente-1');
    expect(clienteRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'cliente-1' }));
  });

  it('rechaza el registro si el telefono ya tiene una cuenta con password', async () => {
    clienteRepo.findOne.mockResolvedValue({ id: 'cliente-1', negocioId: 'negocio-1', passwordHash: 'ya-tiene-hash' });
    await expect(
      service.registrar('negocio-1', { nombre: 'Ana', telefono: '3001234567', password: 'clave123' }),
    ).rejects.toThrow(ConflictException);
  });

  it('login exitoso con telefono y password correctos', async () => {
    const passwordHash = await bcrypt.hash('clave123', 12);
    clienteRepo.findOne.mockResolvedValue({ id: 'cliente-1', negocioId: 'negocio-1', nombre: 'Ana', telefono: '3001234567', email: null, passwordHash, activo: true });
    const resultado = await service.login('negocio-1', { telefono: '3001234567', password: 'clave123' });
    expect(resultado.accessToken).toBe('token-firmado');
  });

  it('login rechaza password incorrecta', async () => {
    const passwordHash = await bcrypt.hash('clave123', 12);
    clienteRepo.findOne.mockResolvedValue({ id: 'cliente-1', negocioId: 'negocio-1', passwordHash, activo: true });
    await expect(
      service.login('negocio-1', { telefono: '3001234567', password: 'clave-mala' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('login rechaza si el cliente no existe', async () => {
    clienteRepo.findOne.mockResolvedValue(null);
    await expect(
      service.login('negocio-1', { telefono: '0000000000', password: 'clave123' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('login rechaza un cliente inactivo', async () => {
    const passwordHash = await bcrypt.hash('clave123', 12);
    clienteRepo.findOne.mockResolvedValue({ id: 'cliente-1', negocioId: 'negocio-1', passwordHash, activo: false });
    await expect(
      service.login('negocio-1', { telefono: '3001234567', password: 'clave123' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
