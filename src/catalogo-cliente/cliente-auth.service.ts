import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Cliente } from '../clientes/entities/cliente.entity';
import { RegistroClienteDto } from './dto/registro-cliente.dto';
import { LoginClienteDto } from './dto/login-cliente.dto';

export interface SesionCliente {
  accessToken: string;
  cliente: { id: string; nombre: string; telefono: string; email: string | null };
}

@Injectable()
export class ClienteAuthService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepo: Repository<Cliente>,
    private readonly jwtService: JwtService,
  ) {}

  async registrar(negocioId: string, dto: RegistroClienteDto): Promise<SesionCliente> {
    const existente = await this.clienteRepo.findOne({
      where: { negocioId, telefono: dto.telefono },
    });

    if (existente?.passwordHash) {
      throw new ConflictException('Ya existe una cuenta con ese teléfono — iniciá sesión');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const cliente = existente
      ? Object.assign(existente, { nombre: dto.nombre, passwordHash })
      : this.clienteRepo.create({
          negocioId,
          nombre: dto.nombre,
          telefono: dto.telefono,
          passwordHash,
        });

    await this.clienteRepo.save(cliente);
    return this.emitirSesion(cliente);
  }

  async login(negocioId: string, dto: LoginClienteDto): Promise<SesionCliente> {
    const cliente = await this.clienteRepo.findOne({
      where: { negocioId, telefono: dto.telefono },
    });
    if (!cliente || !cliente.activo || !cliente.passwordHash) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const passwordValida = await bcrypt.compare(dto.password, cliente.passwordHash);
    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return this.emitirSesion(cliente);
  }

  private emitirSesion(cliente: Cliente): SesionCliente {
    return {
      accessToken: this.jwtService.sign({ sub: cliente.id, negocioId: cliente.negocioId }),
      cliente: {
        id: cliente.id,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        email: cliente.email ?? null,
      },
    };
  }
}
