import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Negocio } from './entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { RolUsuario } from '../common/enums/rol-usuario.enum';
import { CreateNegocioDto } from './dto/create-negocio.dto';
import { UpdateNegocioDto } from './dto/update-negocio.dto';

@Injectable()
export class NegociosService {
  constructor(
    @InjectRepository(Negocio)
    private readonly negociosRepository: Repository<Negocio>,
    @InjectRepository(Usuario)
    private readonly usuariosRepository: Repository<Usuario>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(): Promise<Negocio[]> {
    return this.negociosRepository.find({
      where: { activo: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Negocio> {
    const negocio = await this.negociosRepository.findOne({ where: { id } });
    if (!negocio) {
      throw new NotFoundException(`Negocio con ID ${id} no encontrado`);
    }
    return negocio;
  }

  /** Crea el Negocio y su primer usuario ADMIN_NEGOCIO en una sola transacción. */
  async create(dto: CreateNegocioDto): Promise<Negocio> {
    const emailExistente = await this.usuariosRepository.findOne({
      where: { email: dto.adminInicial.email },
    });
    if (emailExistente) {
      throw new ConflictException(
        `Ya existe un usuario con el email ${dto.adminInicial.email}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const negocio = manager.create(Negocio, {
        nombre: dto.nombre,
        nit: dto.nit,
        tipoNegocio: dto.tipoNegocio,
        email: dto.email,
        telefono: dto.telefono,
        direccion: dto.direccion,
      });
      await manager.save(negocio);

      const passwordHash = await bcrypt.hash(dto.adminInicial.password, 12);
      const admin = manager.create(Usuario, {
        negocioId: negocio.id,
        nombre: dto.adminInicial.nombre,
        email: dto.adminInicial.email,
        passwordHash,
        rol: RolUsuario.ADMIN_NEGOCIO,
      });
      await manager.save(admin);

      return negocio;
    });
  }

  async update(id: string, dto: UpdateNegocioDto): Promise<Negocio> {
    const negocio = await this.findOne(id);
    Object.assign(negocio, dto);
    return this.negociosRepository.save(negocio);
  }

  async remove(id: string): Promise<void> {
    const negocio = await this.findOne(id);
    negocio.activo = false;
    await this.negociosRepository.save(negocio);
  }
}
