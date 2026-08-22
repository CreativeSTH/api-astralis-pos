import { NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  DeepPartial,
  FindOptionsOrder,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from 'typeorm';

/**
 * Base para servicios de entidades que pertenecen a un Negocio (tenant).
 *
 * Todas las lecturas/escrituras pasan por aquí para que negocioId se
 * mezcle siempre desde el contexto CLS (poblado por TenantGuard) y nunca
 * dependa de que cada servicio concreto recuerde filtrar manualmente.
 */
export abstract class TenantBaseService<
  T extends ObjectLiteral & { id: string; negocioId: string | null },
> {
  protected constructor(
    protected readonly repository: Repository<T>,
    protected readonly cls: ClsService,
    private readonly entityLabel: string,
  ) {}

  protected getNegocioId(): string {
    const negocioId = this.cls.get<string>('negocioId');
    if (!negocioId) {
      throw new Error(
        'negocioId no está presente en el contexto de la request. ¿Falta el TenantGuard?',
      );
    }
    return negocioId;
  }

  async findAllForTenant(where: FindOptionsWhere<T> = {}): Promise<T[]> {
    return this.repository.find({
      where: {
        ...where,
        negocioId: this.getNegocioId(),
      } as FindOptionsWhere<T>,
      order: { createdAt: 'DESC' } as unknown as FindOptionsOrder<T>,
    });
  }

  async findOneForTenant(id: string): Promise<T> {
    const entity = await this.repository.findOne({
      where: { id, negocioId: this.getNegocioId() } as FindOptionsWhere<T>,
    });
    if (!entity) {
      throw new NotFoundException(
        `${this.entityLabel} con ID ${id} no encontrado`,
      );
    }
    return entity;
  }

  async createForTenant(data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create({
      ...data,
      negocioId: this.getNegocioId(),
    } as DeepPartial<T>);
    return this.repository.save(entity);
  }

  async updateForTenant(id: string, data: DeepPartial<T>): Promise<T> {
    const entity = await this.findOneForTenant(id);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }
}
