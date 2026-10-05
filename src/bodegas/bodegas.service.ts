import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, IsNull, Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Bodega } from './entities/bodega.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { CreateBodegaDto } from './dto/create-bodega.dto';
import { UpdateBodegaDto } from './dto/update-bodega.dto';
import { TiendaOnlineService } from '../tienda-online/tienda-online.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Traslado } from '../traslados/entities/traslado.entity';
import { EstadoTraslado } from '../common/enums/estado-traslado.enum';

/** Lo que devuelve la API: la relación se expone como ids (spec 2026-10-04 §2). */
export type BodegaRespuesta = Omit<Bodega, 'sucursales'> & { sucursalIds: string[] };

function aRespuesta(bodega: Bodega): BodegaRespuesta {
  const { sucursales, ...resto } = bodega;
  return { ...resto, sucursalIds: (sucursales ?? []).map((s) => s.id) };
}

@Injectable()
export class BodegasService extends TenantBaseService<Bodega> {
  constructor(
    @InjectRepository(Bodega) repository: Repository<Bodega>,
    @InjectRepository(Sucursal) private readonly sucursalRepo: Repository<Sucursal>,
    @InjectRepository(Traslado) private readonly trasladoRepo: Repository<Traslado>,
    cls: ClsService,
    private readonly tiendaOnlineService: TiendaOnlineService,
    private readonly auditoria: AuditoriaService,
  ) {
    super(repository, cls, 'Bodega');
  }

  /**
   * Con `sucursalId`, las bodegas asociadas a esa sucursal — en dos consultas: filtrar por la
   * relación en el mismo `find` que la carga dejaría `sucursales` con solo la sucursal filtrada.
   */
  async findAll(sucursalId?: string): Promise<BodegaRespuesta[]> {
    const where: FindOptionsWhere<Bodega> = { negocioId: this.getNegocioId(), activo: true };
    if (sucursalId) {
      const ids = (
        await this.repository.find({ where: { ...where, sucursales: { id: sucursalId } }, select: { id: true } })
      ).map((b) => b.id);
      if (ids.length === 0) return [];
      where.id = In(ids);
    }
    const bodegas = await this.repository.find({ where, relations: { sucursales: true }, order: { createdAt: 'DESC' } });
    return bodegas.map(aRespuesta);
  }

  async findOne(id: string): Promise<BodegaRespuesta> {
    return aRespuesta(await this.findOneForTenant(id, { sucursales: true }));
  }

  /** Cada sucursal asociada que todavía no tenga operativa queda con esta — ver `Sucursal.bodegaOperativaId`. */
  async create(dto: CreateBodegaDto): Promise<BodegaRespuesta> {
    const { sucursalIds, ...datos } = dto;
    const sucursales = await this.resolverSucursales(sucursalIds ?? []);
    const bodega = await this.createForTenant({ ...datos, sucursales });
    await this.asignarOperativaSiFalta(sucursales.map((s) => s.id), bodega.id);
    return aRespuesta(bodega);
  }

  async update(id: string, dto: UpdateBodegaDto): Promise<BodegaRespuesta> {
    const { sucursalIds, ...datos } = dto;
    const bodega = await this.findOneForTenant(id, { sucursales: true });
    const sucursalesAntes = bodega.sucursales;
    Object.assign(bodega, datos);
    if (sucursalIds !== undefined) {
      const nuevas = await this.resolverSucursales(sucursalIds);
      const quitadas = sucursalesAntes.filter((s) => !nuevas.some((n) => n.id === s.id)).map((s) => s.id);
      if (quitadas.length > 0) {
        const dondeEsOperativa = await this.sucursalRepo.findOne({
          where: { id: In(quitadas), negocioId: this.getNegocioId(), bodegaOperativaId: id },
        });
        if (dondeEsOperativa) {
          throw new ConflictException(
            `Esta bodega es la operativa de ${dondeEsOperativa.nombre} — asigná otra como operativa de esa sucursal antes de quitarla`,
          );
        }
      }
      bodega.sucursales = nuevas;
    }
    const guardada = await this.repository.save(bodega);
    if (sucursalIds !== undefined) {
      // TypeORM no emite afterUpdate si solo cambió la tabla de unión (hallazgo de auditoría 2026-10-02).
      await this.auditoria.registrarRelacionesMultiples(Bodega, { ...guardada, sucursales: sucursalesAntes }, guardada);
      const agregadas = guardada.sucursales.filter((s) => !sucursalesAntes.some((a) => a.id === s.id)).map((s) => s.id);
      await this.asignarOperativaSiFalta(agregadas, id);
    }
    return aRespuesta(guardada);
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
        'Esta bodega es la operativa de una sucursal — asigná otra como operativa antes de desactivarla',
      );
    }
    const negocioId = this.getNegocioId();
    const conTrasladosEnTransito = await this.trasladoRepo.exists({
      where: [
        { negocioId, estado: EstadoTraslado.EN_TRANSITO, bodegaOrigenId: id },
        { negocioId, estado: EstadoTraslado.EN_TRANSITO, bodegaDestinoId: id },
      ],
    });
    if (conTrasladosEnTransito) {
      throw new ConflictException(
        'Esta bodega tiene traslados en tránsito — recibilos o cancelalos antes de desactivarla',
      );
    }
    await this.updateForTenant(id, { activo: false });
  }

  private async resolverSucursales(ids: string[]): Promise<Sucursal[]> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return [];
    const sucursales = await this.sucursalRepo.find({ where: { id: In(unicos), negocioId: this.getNegocioId() } });
    if (sucursales.length !== unicos.length) {
      throw new BadRequestException('Alguna de las sucursales indicadas no existe en este negocio');
    }
    return unicos.map((id) => sucursales.find((s) => s.id === id)!);
  }

  private async asignarOperativaSiFalta(sucursalIds: string[], bodegaId: string): Promise<void> {
    if (sucursalIds.length === 0) return;
    await this.sucursalRepo.update(
      { id: In(sucursalIds), negocioId: this.getNegocioId(), bodegaOperativaId: IsNull() },
      { bodegaOperativaId: bodegaId },
    );
  }
}
