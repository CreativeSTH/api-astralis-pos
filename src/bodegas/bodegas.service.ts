import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Bodega } from './entities/bodega.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { CreateBodegaDto } from './dto/create-bodega.dto';
import { UpdateBodegaDto } from './dto/update-bodega.dto';
import { TiendaOnlineService } from '../tienda-online/tienda-online.service';

@Injectable()
export class BodegasService extends TenantBaseService<Bodega> {
  constructor(
    @InjectRepository(Bodega) repository: Repository<Bodega>,
    @InjectRepository(Sucursal) private readonly sucursalRepo: Repository<Sucursal>,
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

  /** La primera bodega de una sucursal queda como su operativa sin pasos extra — ver `Sucursal.bodegaOperativaId`. */
  async create(dto: CreateBodegaDto) {
    const bodega = await this.createForTenant(dto);
    await this.sucursalRepo.update(
      { id: dto.sucursalId, negocioId: this.getNegocioId(), bodegaOperativaId: IsNull() },
      { bodegaOperativaId: bodega.id },
    );
    return bodega;
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
    const esOperativaDeAlgunaSucursal = await this.sucursalRepo.exists({
      where: { bodegaOperativaId: id, negocioId: this.getNegocioId() },
    });
    if (esOperativaDeAlgunaSucursal) {
      throw new ConflictException(
        'Esta bodega es la operativa de su sucursal — asigná otra como operativa antes de desactivarla',
      );
    }
    await this.updateForTenant(id, { activo: false });
  }
}
