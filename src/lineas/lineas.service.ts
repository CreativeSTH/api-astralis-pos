import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Linea } from './entities/linea.entity';
import { CreateLineaDto } from './dto/create-linea.dto';
import { UpdateLineaDto } from './dto/update-linea.dto';

@Injectable()
export class LineasService extends TenantBaseService<Linea> {
  constructor(
    @InjectRepository(Linea) repository: Repository<Linea>,
    cls: ClsService,
  ) {
    super(repository, cls, 'Linea');
  }

  findAll(marcaId?: string) {
    return this.findAllForTenant(
      marcaId ? { activo: true, marcaId } : { activo: true },
    );
  }

  findOne(id: string) {
    return this.findOneForTenant(id);
  }

  create(dto: CreateLineaDto) {
    return this.createForTenant(dto);
  }

  update(id: string, dto: UpdateLineaDto) {
    return this.updateForTenant(id, dto);
  }

  async remove(id: string) {
    await this.updateForTenant(id, { activo: false });
  }
}
