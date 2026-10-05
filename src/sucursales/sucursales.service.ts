import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Sucursal } from './entities/sucursal.entity';
import { Bodega } from '../bodegas/entities/bodega.entity';
import { bodegaAsociadaASucursal } from '../bodegas/bodega-asociacion';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';

@Injectable()
export class SucursalesService extends TenantBaseService<Sucursal> {
  constructor(
    @InjectRepository(Sucursal) repository: Repository<Sucursal>,
    @InjectRepository(Bodega) private readonly bodegaRepo: Repository<Bodega>,
    cls: ClsService,
  ) {
    super(repository, cls, 'Sucursal');
  }

  findAll() {
    return this.findAllForTenant({ activo: true });
  }

  findOne(id: string) {
    return this.findOneForTenant(id);
  }

  create(dto: CreateSucursalDto) {
    return this.createForTenant(dto);
  }

  async update(id: string, dto: UpdateSucursalDto) {
    if (dto.bodegaOperativaId) {
      const asociada = await bodegaAsociadaASucursal(
        this.bodegaRepo.manager,
        this.getNegocioId(),
        dto.bodegaOperativaId,
        id,
      );
      if (!asociada) {
        throw new NotFoundException('La bodega operativa debe estar asociada a esta sucursal');
      }
    }
    return this.updateForTenant(id, dto);
  }

  async remove(id: string) {
    await this.updateForTenant(id, { activo: false });
  }
}
