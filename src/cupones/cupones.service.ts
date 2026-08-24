import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Promocion } from './entities/promocion.entity';
import { PromocionUso } from './entities/promocion-uso.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Bodega } from '../bodegas/entities/bodega.entity';
import { Categoria } from '../categorias/entities/categoria.entity';
import { Producto } from '../productos/entities/producto.entity';
import { TipoPromocion } from '../common/enums/tipo-promocion.enum';
import { CreatePromocionDto } from './dto/create-promocion.dto';
import { UpdatePromocionDto } from './dto/update-promocion.dto';

export type EstadoPromocion = 'PROGRAMADA' | 'ACTIVA' | 'EXPIRADA' | 'AGOTADA' | 'INACTIVA';

export interface PromocionConEstado extends Promocion {
  estado: EstadoPromocion;
  usosActuales: number;
}

const RELACIONES = { sucursales: true, bodegas: true, categorias: true, productos: true } as const;

@Injectable()
export class CuponesService extends TenantBaseService<Promocion> {
  constructor(
    @InjectRepository(Promocion)
    repository: Repository<Promocion>,
    @InjectRepository(PromocionUso)
    private readonly usoRepository: Repository<PromocionUso>,
    cls: ClsService,
  ) {
    super(repository, cls, 'Cupón/Promoción');
  }

  async findAll(tipo?: TipoPromocion): Promise<PromocionConEstado[]> {
    const promociones = await this.findAllForTenant(tipo ? { tipo } : {}, RELACIONES);
    return Promise.all(promociones.map((p) => this.conEstado(p)));
  }

  async findOne(id: string): Promise<PromocionConEstado> {
    const promocion = await this.findOneForTenant(id, RELACIONES);
    return this.conEstado(promocion);
  }

  async create(dto: CreatePromocionDto): Promise<Promocion> {
    if (dto.tipo === TipoPromocion.CUPON && !dto.codigo) {
      throw new BadRequestException('Un cupón requiere código');
    }
    const creadoPor = this.cls.get<string>('usuarioId');
    try {
      return await this.createForTenant({
        ...this.mapearCampos(dto),
        creadoPor,
      });
    } catch (error) {
      throw this.traducirErrorCodigo(error);
    }
  }

  async update(id: string, dto: UpdatePromocionDto): Promise<Promocion> {
    // Relaciones M2M cargadas de antemano: TypeORM necesita el estado previo para poder
    // calcular altas/bajas en las tablas de unión al guardar, no solo insertar lo nuevo.
    const actual = await this.findOneForTenant(id, RELACIONES);
    const tipoFinal = dto.tipo ?? actual.tipo;
    if (tipoFinal === TipoPromocion.CUPON && !(dto.codigo ?? actual.codigo)) {
      throw new BadRequestException('Un cupón requiere código');
    }
    Object.assign(actual, this.mapearCampos(dto));
    try {
      return await this.repository.save(actual);
    } catch (error) {
      throw this.traducirErrorCodigo(error);
    }
  }

  async remove(id: string): Promise<void> {
    await this.updateForTenant(id, { activo: false });
  }

  private mapearCampos(dto: CreatePromocionDto | UpdatePromocionDto) {
    return {
      ...(dto.tipo !== undefined && { tipo: dto.tipo }),
      ...(dto.nombre !== undefined && { nombre: dto.nombre }),
      ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
      ...(dto.codigo !== undefined && { codigo: dto.codigo }),
      ...(dto.tipoDescuento !== undefined && { tipoDescuento: dto.tipoDescuento }),
      ...(dto.valor !== undefined && { valor: dto.valor }),
      ...(dto.montoMinimoCompra !== undefined && { montoMinimoCompra: dto.montoMinimoCompra }),
      ...(dto.fechaInicio !== undefined && { fechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : undefined }),
      ...(dto.fechaFin !== undefined && { fechaFin: dto.fechaFin ? new Date(dto.fechaFin) : undefined }),
      ...(dto.usoMaximo !== undefined && { usoMaximo: dto.usoMaximo }),
      ...(dto.activo !== undefined && { activo: dto.activo }),
      ...(dto.sucursalIds !== undefined && {
        sucursales: dto.sucursalIds.map((id) => ({ id }) as Sucursal),
      }),
      ...(dto.bodegaIds !== undefined && {
        bodegas: dto.bodegaIds.map((id) => ({ id }) as Bodega),
      }),
      ...(dto.categoriaIds !== undefined && {
        categorias: dto.categoriaIds.map((id) => ({ id }) as Categoria),
      }),
      ...(dto.productoIds !== undefined && {
        productos: dto.productoIds.map((id) => ({ id }) as Producto),
      }),
    };
  }

  private traducirErrorCodigo(error: unknown): unknown {
    if (error instanceof QueryFailedError && (error as unknown as { code?: string }).code === '23505') {
      return new BadRequestException('Ya existe un cupón con ese código en este negocio');
    }
    return error;
  }

  private async conEstado(promocion: Promocion): Promise<PromocionConEstado> {
    const usosActuales = await this.usoRepository.count({ where: { promocionId: promocion.id } });
    return { ...promocion, estado: this.calcularEstado(promocion, usosActuales), usosActuales };
  }

  private calcularEstado(promocion: Promocion, usosActuales: number): EstadoPromocion {
    if (!promocion.activo) return 'INACTIVA';
    const ahora = new Date();
    if (promocion.fechaInicio && promocion.fechaInicio > ahora) return 'PROGRAMADA';
    if (promocion.fechaFin && promocion.fechaFin < ahora) return 'EXPIRADA';
    if (promocion.usoMaximo != null && usosActuales >= promocion.usoMaximo) return 'AGOTADA';
    return 'ACTIVA';
  }
}
