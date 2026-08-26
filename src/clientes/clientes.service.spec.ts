import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { ClientesService } from './clientes.service';
import { Cliente } from './entities/cliente.entity';
import { NotaCliente } from './entities/nota-cliente.entity';
import { DireccionCliente } from './entities/direccion-cliente.entity';

describe('ClientesService — resetearPassword', () => {
  let service: ClientesService;
  let repo: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn().mockResolvedValue({ id: 'cliente-1', negocioId: 'negocio-1', passwordHash: 'hash-viejo' }),
      save: jest.fn((x) => x),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClientesService,
        { provide: getRepositoryToken(Cliente), useValue: repo },
        { provide: getRepositoryToken(NotaCliente), useValue: {} },
        { provide: getRepositoryToken(DireccionCliente), useValue: {} },
        { provide: ClsService, useValue: { get: jest.fn().mockReturnValue('negocio-1') } },
      ],
    }).compile();
    service = moduleRef.get(ClientesService);
  });

  it('genera una contrasena temporal, la guarda hasheada, y la devuelve en texto plano', async () => {
    const resultado = await service.resetearPassword('cliente-1');
    expect(resultado.passwordTemporal).toHaveLength(8);
    expect(repo.save).toHaveBeenCalled();
    const guardado = repo.save.mock.calls[0][0];
    expect(guardado.passwordHash).not.toBe('hash-viejo');
    expect(guardado.passwordHash).not.toBe(resultado.passwordTemporal);
  });
});
