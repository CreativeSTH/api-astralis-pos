import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Rol } from '../roles/entities/rol.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { PermisosService } from '../roles/permisos.service';
import { EmailService } from '../email/email.service';

describe('AuthService — login', () => {
  let service: AuthService;
  let usuariosRepository: { findOne: jest.Mock };
  let rolesRepository: { findOne: jest.Mock };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    usuariosRepository = { findOne: jest.fn() };
    rolesRepository = { findOne: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('token-fake') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(Usuario), useValue: usuariosRepository },
        { provide: getRepositoryToken(Rol), useValue: rolesRepository },
        { provide: getRepositoryToken(Negocio), useValue: {} },
        { provide: PermisosService, useValue: {} },
        { provide: JwtService, useValue: jwtService },
        { provide: EmailService, useValue: { enviar: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('permite iniciar sesión con el correo sin verificar y expone emailVerificado en la respuesta', async () => {
    usuariosRepository.findOne.mockResolvedValue({
      id: 'u1',
      email: 'test@test.com',
      passwordHash: await bcrypt.hash('pass123', 12),
      activo: true,
      rolId: 'r1',
      negocioId: 'neg-1',
      sucursalId: null,
      nombre: 'Test',
      emailVerificado: false,
    });
    rolesRepository.findOne.mockResolvedValue({
      id: 'r1',
      tier: 'NEGOCIO',
      nombre: 'Administrador',
      permisos: [],
    });

    const resultado = await service.login({ email: 'test@test.com', password: 'pass123' });

    expect(resultado.usuario.emailVerificado).toBe(false);
    expect(resultado.accessToken).toBe('token-fake');
  });

  it('rechaza con contraseña incorrecta, con o sin correo verificado', async () => {
    usuariosRepository.findOne.mockResolvedValue({
      id: 'u1',
      email: 'test@test.com',
      passwordHash: await bcrypt.hash('pass123', 12),
      activo: true,
      emailVerificado: true,
    });

    await expect(service.login({ email: 'test@test.com', password: 'incorrecta' })).rejects.toThrow(
      'Credenciales inválidas',
    );
  });
});
