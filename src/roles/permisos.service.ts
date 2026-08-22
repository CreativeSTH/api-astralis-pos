import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permiso } from './entities/permiso.entity';
import { Rol } from './entities/rol.entity';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { RolTier } from '../common/enums/rol-tier.enum';

@Injectable()
export class PermisosService {
  constructor(
    @InjectRepository(Permiso)
    private readonly permisosRepository: Repository<Permiso>,
    @InjectRepository(Rol)
    private readonly rolesRepository: Repository<Rol>,
  ) {}

  findAll(tier?: RolTier): Promise<Permiso[]> {
    return this.permisosRepository.find({
      where: tier ? { tier } : {},
      order: { modulo: 'ASC', accion: 'ASC' },
    });
  }

  async findByIds(ids: string[]): Promise<Permiso[]> {
    if (ids.length === 0) return [];
    return this.permisosRepository.find({ where: { id: In(ids) } });
  }

  /**
   * Chequeo central de autorización: ¿el rol dado tiene el permiso módulo+acción?
   * Consulta la DB en cada llamada (no cachea) — a diferencia del viejo `rol`
   * baked-in-JWT, editar los permisos de un rol debe tener efecto inmediato
   * para todo el que lo tenga, sin esperar a que vuelva a loguearse.
   */
  async rolTienePermiso(
    rolId: string | undefined | null,
    modulo: ModuloPermiso,
    accion: AccionPermiso,
  ): Promise<boolean> {
    if (!rolId) return false;
    const count = await this.rolesRepository
      .createQueryBuilder('rol')
      .innerJoin('rol.permisos', 'permiso')
      .where('rol.id = :rolId', { rolId })
      .andWhere('rol.activo = true')
      .andWhere('permiso.modulo = :modulo', { modulo })
      .andWhere('permiso.accion = :accion', { accion })
      .getCount();
    return count > 0;
  }

  /** Crea las filas del catálogo (16 módulos × 4 acciones) que falten. Idempotente. */
  async sembrarCatalogo(): Promise<void> {
    const existentes = await this.permisosRepository.find();
    const existeSet = new Set(existentes.map((p) => `${p.modulo}:${p.accion}`));
    const nuevos: Partial<Permiso>[] = [];
    for (const modulo of Object.values(ModuloPermiso)) {
      const tier =
        modulo === ModuloPermiso.NEGOCIOS ? RolTier.SISTEMA : RolTier.NEGOCIO;
      for (const accion of Object.values(AccionPermiso)) {
        const key = `${modulo}:${accion}`;
        if (!existeSet.has(key)) {
          nuevos.push({ modulo, accion, tier });
        }
      }
    }
    if (nuevos.length > 0) {
      await this.permisosRepository.save(nuevos as Permiso[]);
    }
  }
}
