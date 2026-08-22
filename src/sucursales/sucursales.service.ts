import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Sucursal } from './entities/sucursal.entity';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';

@Injectable()
export class SucursalesService extends TenantBaseService<Sucursal> {
  constructor(
    @InjectRepository(Sucursal) repository: Repository<Sucursal>,
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

  update(id: string, dto: UpdateSucursalDto) {
    return this.updateForTenant(id, dto);
  }

  async remove(id: string) {
    await this.updateForTenant(id, { activo: false });
  }
}
