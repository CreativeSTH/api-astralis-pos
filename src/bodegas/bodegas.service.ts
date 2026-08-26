import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Bodega } from './entities/bodega.entity';
import { CreateBodegaDto } from './dto/create-bodega.dto';
import { UpdateBodegaDto } from './dto/update-bodega.dto';
import { TiendaOnlineService } from '../tienda-online/tienda-online.service';

@Injectable()
export class BodegasService extends TenantBaseService<Bodega> {
  constructor(
    @InjectRepository(Bodega) repository: Repository<Bodega>,
    cls: ClsService,
    private readonly tiendaOnlineService: TiendaOnlineService,
  ) {
    super(repository, cls, 'Bodega');
  }

  findAll() {
    return this.findAllForTenant({ activo: true });
  }

  findOne(id: string) {
    return this.findOneForTenant(id);
  }

  create(dto: CreateBodegaDto) {
    return this.createForTenant(dto);
  }

  update(id: string, dto: UpdateBodegaDto) {
    return this.updateForTenant(id, dto);
  }

  async remove(id: string) {
    const enUso = await this.tiendaOnlineService.estaUsadaPorTiendaActiva(id);
    if (enUso) {
      throw new ConflictException(
        'Esta bodega está en uso por la tienda online activa — desactivá la tienda online o cambiá su bodega antes de continuar',
      );
    }
    await this.updateForTenant(id, { activo: false });
  }
}
