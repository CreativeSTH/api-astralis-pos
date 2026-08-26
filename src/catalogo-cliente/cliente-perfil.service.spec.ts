import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ClientePerfilService } from './cliente-perfil.service';
import { Cliente } from '../clientes/entities/cliente.entity';
import { DireccionCliente } from '../clientes/entities/direccion-cliente.entity';

describe('ClientePerfilService', () => {
  let service: ClientePerfilService;
  let clienteRepo: { findOne: jest.Mock; save: jest.Mock };
  let direccionRepo: { find: jest.Mock; count: jest.Mock; create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    clienteRepo = { findOne: jest.fn(), save: jest.fn((x) => x) };
    direccionRepo = {
      find: jest.fn(),
      count: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn((x) => x),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ClientePerfilService,
        { provide: getRepositoryToken(Cliente), useValue: clienteRepo },
        { provide: getRepositoryToken(DireccionCliente), useValue: direccionRepo },
      ],
    }).compile();
    service = moduleRef.get(ClientePerfilService);
  });

  it('obtenerPerfil devuelve los datos del cliente', async () => {
    clienteRepo.findOne.mockResolvedValue({ id: 'cliente-1', nombre: 'Ana', telefono: '3001234567', email: 'ana@mail.com' });
    const perfil = await service.obtenerPerfil('cliente-1');
    expect(perfil).toEqual({ id: 'cliente-1', nombre: 'Ana', telefono: '3001234567', email: 'ana@mail.com' });
  });

  it('obtenerPerfil lanza NotFoundException si el cliente no existe', async () => {
    clienteRepo.findOne.mockResolvedValue(null);
    await expect(service.obtenerPerfil('cliente-fantasma')).rejects.toThrow(NotFoundException);
  });

  it('agregarDireccion marca la primera direccion como predeterminada', async () => {
    direccionRepo.count.mockResolvedValue(0);
    const direccion = await service.agregarDireccion('negocio-1', 'cliente-1', { direccionLinea1: 'Calle 1 # 2-3' });
    expect(direccion.predeterminada).toBe(true);
    expect(direccionRepo.save).toHaveBeenCalled();
  });

  it('agregarDireccion no marca predeterminada si ya hay otras y no se pidio', async () => {
    direccionRepo.count.mockResolvedValue(2);
    const direccion = await service.agregarDireccion('negocio-1', 'cliente-1', { direccionLinea1: 'Calle 1 # 2-3' });
    expect(direccion.predeterminada).toBe(false);
  });

  it('listarPedidos devuelve una lista vacia', async () => {
    await expect(service.listarPedidos()).resolves.toEqual([]);
  });
});
