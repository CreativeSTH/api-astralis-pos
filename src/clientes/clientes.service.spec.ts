import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { ClientesService } from './clientes.service';
import { Cliente } from './entities/cliente.entity';
import { NotaCliente } from './entities/nota-cliente.entity';
import { DireccionCliente } from './entities/direccion-cliente.entity';
import { MovimientoSaldoCliente } from './entities/movimiento-saldo-cliente.entity';

describe('ClientesService — resetearPassword', () => {
  let service: ClientesService;
  let repo: { findOne: jest.Mock; save: jest.Mock };
  let movimientos: { find: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn().mockResolvedValue({ id: 'cliente-1', negocioId: 'negocio-1', passwordHash: 'hash-viejo' }),
      save: jest.fn((x) => x),
    };
    movimientos = { find: jest.fn().mockResolvedValue([{ tipo: 'ABONO_DEVOLUCION', monto: '5000.00' }]) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClientesService,
        { provide: getRepositoryToken(Cliente), useValue: repo },
        { provide: getRepositoryToken(NotaCliente), useValue: {} },
        { provide: getRepositoryToken(DireccionCliente), useValue: {} },
        { provide: getRepositoryToken(MovimientoSaldoCliente), useValue: movimientos },
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

  it('saldoAFavor: saldo del cliente del negocio y sus últimos movimientos', async () => {
    repo.findOne.mockResolvedValue({ id: 'cliente-1', negocioId: 'negocio-1', saldoAFavor: '5000.00' });
    const r = await service.saldoAFavor('cliente-1');
    expect(r.saldoAFavor).toBe(5000);
    expect(movimientos.find).toHaveBeenCalledWith({
      where: { clienteId: 'cliente-1', negocioId: 'negocio-1' },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  });

  it('saldoAFavor: 404 si el cliente es de otro negocio', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.saldoAFavor('ajeno')).rejects.toThrow();
    expect(movimientos.find).not.toHaveBeenCalled();
  });
});
