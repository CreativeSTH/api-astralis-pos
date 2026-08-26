import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { TiendaOnline } from './entities/tienda-online.entity';
import { Bodega } from '../bodegas/entities/bodega.entity';

@Injectable()
export class TiendaOnlineService extends TenantBaseService<TiendaOnline> {
  constructor(
    @InjectRepository(TiendaOnline)
    private readonly tiendaRepo: Repository<TiendaOnline>,
    @InjectRepository(Bodega)
    private readonly bodegaRepo: Repository<Bodega>,
    cls: ClsService,
  ) {
    super(tiendaRepo, cls, 'Tienda online');
  }

  private async obtenerOCrear(): Promise<TiendaOnline> {
    const negocioId = this.getNegocioId();
    let tienda = await this.tiendaRepo.findOne({ where: { negocioId } });
    if (!tienda) {
      tienda = this.tiendaRepo.create({ negocioId, bodegaId: null, activo: false });
    }
    return tienda;
  }

  async obtenerConfiguracion(): Promise<{ bodegaId: string | null; activo: boolean }> {
    const tienda = await this.tiendaRepo.findOne({ where: { negocioId: this.getNegocioId() } });
    return { bodegaId: tienda?.bodegaId ?? null, activo: tienda?.activo ?? false };
  }

  async elegirBodega(bodegaId: string): Promise<void> {
    const negocioId = this.getNegocioId();
    const bodega = await this.bodegaRepo.findOne({ where: { id: bodegaId, negocioId } });
    if (!bodega) {
      throw new NotFoundException('Bodega no encontrada');
    }
    const tienda = await this.obtenerOCrear();
    tienda.bodegaId = bodegaId;
    await this.tiendaRepo.save(tienda);
  }

  async activar(): Promise<void> {
    const tienda = await this.tiendaRepo.findOne({ where: { negocioId: this.getNegocioId() } });
    if (!tienda?.bodegaId) {
      throw new BadRequestException('Elegí una bodega antes de activar la tienda online');
    }
    tienda.activo = true;
    await this.tiendaRepo.save(tienda);
  }

  async desactivar(): Promise<void> {
    const tienda = await this.tiendaRepo.findOne({ where: { negocioId: this.getNegocioId() } });
    if (!tienda) return;
    tienda.activo = false;
    await this.tiendaRepo.save(tienda);
  }

  /** Usado por `BodegasService.remove()` (Task 4) para bloquear la desactivación de una bodega en uso. */
  async estaUsadaPorTiendaActiva(bodegaId: string): Promise<boolean> {
    const tienda = await this.tiendaRepo.findOne({
      where: { negocioId: this.getNegocioId(), bodegaId, activo: true },
    });
    return !!tienda;
  }
}
