import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import * as bcrypt from 'bcrypt';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Usuario } from './entities/usuario.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { RolesService } from '../roles/roles.service';

@Injectable()
export class UsuariosService extends TenantBaseService<Usuario> {
  constructor(
    @InjectRepository(Usuario) repository: Repository<Usuario>,
    cls: ClsService,
    private readonly rolesService: RolesService,
  ) {
    super(repository, cls, 'Usuario');
  }

  findAll() {
    return this.findAllForTenant({ activo: true }, { rol: true });
  }

  findOne(id: string) {
    return this.findOneForTenant(id, { rol: true });
  }

  async create(dto: CreateUsuarioDto): Promise<Usuario> {
    const existente = await this.repository.findOne({
      where: { email: dto.email },
    });
    if (existente) {
      throw new ConflictException(
        `Ya existe un usuario con el email ${dto.email}`,
      );
    }
    // Falla con NotFoundException si el rolId no pertenece al negocio del caller.
    await this.rolesService.findOne(dto.rolId);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const pinHash = dto.pin ? await bcrypt.hash(dto.pin, 10) : undefined;
    return this.createForTenant({
      nombre: dto.nombre,
      email: dto.email,
      passwordHash,
      pinHash,
      rolId: dto.rolId,
      sucursalId: dto.sucursalId ?? null,
    });
  }

  async update(id: string, dto: UpdateUsuarioDto) {
    const { pin, rolId, ...resto } = dto;
    if (rolId) {
      await this.rolesService.findOne(rolId);
    }
    const pinHash = pin ? await bcrypt.hash(pin, 10) : undefined;
    return this.updateForTenant(id, {
      ...resto,
      ...(rolId && { rolId }),
      ...(pinHash && { pinHash }),
    });
  }

  async remove(id: string) {
    await this.updateForTenant(id, { activo: false });
  }
}
