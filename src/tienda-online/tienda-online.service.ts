import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { TiendaOnline } from './entities/tienda-online.entity';
import { Bodega } from '../bodegas/entities/bodega.entity';
import { PlantillaTienda } from '../common/enums/plantilla-tienda.enum';

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

  async obtenerConfiguracion() {
    const tienda = await this.tiendaRepo.findOne({ where: { negocioId: this.getNegocioId() } });
    return this.mapearConfiguracion(tienda);
  }

  /** Variante sin CLS de `obtenerConfiguracion()` — para consumidores públicos (catálogo de tienda) que no tienen un Usuario interno logueado detrás. */
  async obtenerConfiguracionPublica(negocioId: string) {
    const tienda = await this.tiendaRepo.findOne({ where: { negocioId } });
    return this.mapearConfiguracion(tienda);
  }

  private mapearConfiguracion(tienda: TiendaOnline | null) {
    return {
      bodegaId: tienda?.bodegaId ?? null,
      activo: tienda?.activo ?? false,
      plantilla: tienda?.plantilla ?? PlantillaTienda.AURORA,
      logoUrl: tienda?.logoUrl ?? null,
      banners: tienda?.banners ?? [],
      terminos: tienda?.terminos ?? null,
      tratamientoDatos: tienda?.tratamientoDatos ?? null,
      politicaEnvios: tienda?.politicaEnvios ?? null,
    };
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

  async actualizarPlantilla(plantilla: PlantillaTienda): Promise<void> {
    const tienda = await this.obtenerOCrear();
    tienda.plantilla = plantilla;
    await this.tiendaRepo.save(tienda);
  }

  async actualizarLegales(dto: {
    terminos?: string;
    tratamientoDatos?: string;
    politicaEnvios?: string;
  }): Promise<void> {
    const tienda = await this.obtenerOCrear();
    if (dto.terminos !== undefined) tienda.terminos = dto.terminos;
    if (dto.tratamientoDatos !== undefined) tienda.tratamientoDatos = dto.tratamientoDatos;
    if (dto.politicaEnvios !== undefined) tienda.politicaEnvios = dto.politicaEnvios;
    await this.tiendaRepo.save(tienda);
  }

  async actualizarLogo(logoUrl: string): Promise<void> {
    const tienda = await this.obtenerOCrear();
    tienda.logoUrl = logoUrl;
    await this.tiendaRepo.save(tienda);
  }

  async agregarBanner(url: string): Promise<string[]> {
    const tienda = await this.obtenerOCrear();
    const banners = tienda.banners ?? [];
    if (banners.length >= 4) {
      throw new BadRequestException('Ya hay 4 banners — eliminá uno antes de agregar otro');
    }
    tienda.banners = [...banners, url];
    await this.tiendaRepo.save(tienda);
    return tienda.banners;
  }

  async eliminarBanner(index: number): Promise<string[]> {
    const tienda = await this.obtenerOCrear();
    const banners = tienda.banners ?? [];
    if (index < 0 || index >= banners.length) {
      throw new NotFoundException('No existe un banner en esa posición');
    }
    tienda.banners = banners.filter((_, i) => i !== index);
    await this.tiendaRepo.save(tienda);
    return tienda.banners;
  }

  /** Usado por `BodegasService.remove()` (Task 4) para bloquear la desactivación de una bodega en uso. */
  async estaUsadaPorTiendaActiva(bodegaId: string): Promise<boolean> {
    const tienda = await this.tiendaRepo.findOne({
      where: { negocioId: this.getNegocioId(), bodegaId, activo: true },
    });
    return !!tienda;
  }
}
