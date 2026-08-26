import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from '../clientes/entities/cliente.entity';
import { DireccionCliente } from '../clientes/entities/direccion-cliente.entity';
import { CreateDireccionClienteDto } from '../clientes/dto/create-direccion-cliente.dto';
import { ActualizarPerfilClienteDto } from './dto/actualizar-perfil-cliente.dto';

@Injectable()
export class ClientePerfilService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepo: Repository<Cliente>,
    @InjectRepository(DireccionCliente)
    private readonly direccionRepo: Repository<DireccionCliente>,
  ) {}

  async obtenerPerfil(clienteId: string) {
    const cliente = await this.clienteRepo.findOne({ where: { id: clienteId } });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return {
      id: cliente.id,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      email: cliente.email ?? null,
    };
  }

  async actualizarPerfil(clienteId: string, dto: ActualizarPerfilClienteDto): Promise<void> {
    const cliente = await this.clienteRepo.findOne({ where: { id: clienteId } });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }
    Object.assign(cliente, dto);
    await this.clienteRepo.save(cliente);
  }

  listarDirecciones(clienteId: string): Promise<DireccionCliente[]> {
    return this.direccionRepo.find({
      where: { clienteId, activo: true },
      order: { predeterminada: 'DESC', createdAt: 'DESC' },
    });
  }

  /** Misma regla que `ClientesService.agregarDireccion` (primera dirección = predeterminada) — reimplementada acá porque ese método depende del contexto CLS de un Usuario interno, que no existe en una request de cliente. */
  async agregarDireccion(
    negocioId: string,
    clienteId: string,
    dto: CreateDireccionClienteDto,
  ): Promise<DireccionCliente> {
    const esLaPrimera = (await this.direccionRepo.count({ where: { clienteId, activo: true } })) === 0;

    const direccion = this.direccionRepo.create({
      negocioId,
      clienteId,
      ...dto,
      predeterminada: dto.predeterminada || esLaPrimera,
    });
    return this.direccionRepo.save(direccion);
  }

  /** Placeholder intencional — las ventas online recién existen en el subproyecto 6 (sincronización con el POS). */
  async listarPedidos(): Promise<[]> {
    return [];
  }
}
