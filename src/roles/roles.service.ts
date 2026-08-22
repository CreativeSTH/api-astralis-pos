import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { Rol } from './entities/rol.entity';
import { Permiso } from './entities/permiso.entity';
import { PermisosService } from './permisos.service';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { RolTier } from '../common/enums/rol-tier.enum';

/** Módulo → acciones que el Cajero por defecto recibe sembrado. Todo lo demás no listado aquí queda sin marcar. */
const PERMISOS_CAJERO: Partial<Record<ModuloPermiso, AccionPermiso[]>> = {
  [ModuloPermiso.SUCURSALES]: [AccionPermiso.VER],
  [ModuloPermiso.PRODUCTOS]: [AccionPermiso.VER],
  [ModuloPermiso.CATEGORIAS]: [AccionPermiso.VER],
  [ModuloPermiso.MARCAS]: [AccionPermiso.VER],
  [ModuloPermiso.LINEAS]: [AccionPermiso.VER],
  [ModuloPermiso.BODEGAS]: [AccionPermiso.VER],
  [ModuloPermiso.INVENTARIO]: [AccionPermiso.VER],
  [ModuloPermiso.VENTAS]: [
    AccionPermiso.VER,
    AccionPermiso.CREAR,
    AccionPermiso.EDITAR,
  ],
  [ModuloPermiso.CAJA]: [
    AccionPermiso.VER,
    AccionPermiso.CREAR,
    AccionPermiso.EDITAR,
  ],
  [ModuloPermiso.COBROS]: [AccionPermiso.VER],
  [ModuloPermiso.CLIENTES]: [AccionPermiso.VER, AccionPermiso.CREAR],
  [ModuloPermiso.ALERTAS]: [AccionPermiso.VER],
};

/**
 * A diferencia del resto de servicios de negocio, Rol no puede extender
 * TenantBaseService: su negocioId es nullable (roles de tier SISTEMA no
 * pertenecen a ningún negocio) — mismo precedente que NegociosService.
 */
@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Rol)
    private readonly rolesRepository: Repository<Rol>,
    @InjectRepository(Permiso)
    private readonly permisosRepository: Repository<Permiso>,
    private readonly permisos: PermisosService,
    private readonly cls: ClsService,
  ) {}

  private getTier(): RolTier {
    const tier = this.cls.get<RolTier>('rolTier');
    if (!tier) {
      throw new Error(
        'rolTier no está presente en el contexto — ¿falta TenantGuard?',
      );
    }
    return tier;
  }

  private getNegocioId(): string {
    const negocioId = this.cls.get<string>('negocioId');
    if (!negocioId) {
      throw new Error(
        'negocioId no está presente en el contexto — ¿falta TenantGuard?',
      );
    }
    return negocioId;
  }

  findAll(): Promise<Rol[]> {
    const tier = this.getTier();
    return this.rolesRepository.find({
      where:
        tier === RolTier.SISTEMA
          ? { tier: RolTier.SISTEMA, activo: true }
          : { tier: RolTier.NEGOCIO, negocioId: this.getNegocioId(), activo: true },
      relations: { permisos: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Rol> {
    const tier = this.getTier();
    const rol = await this.rolesRepository.findOne({
      where:
        tier === RolTier.SISTEMA
          ? { id, tier: RolTier.SISTEMA }
          : { id, tier: RolTier.NEGOCIO, negocioId: this.getNegocioId() },
      relations: { permisos: true },
    });
    if (!rol) {
      throw new NotFoundException(`Rol con ID ${id} no encontrado`);
    }
    return rol;
  }

  async create(dto: CreateRolDto): Promise<Rol> {
    const tier = this.getTier();
    const rol = this.rolesRepository.create({
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      tier,
      negocioId: tier === RolTier.SISTEMA ? null : this.getNegocioId(),
      esDefault: false,
      permisos: [],
    });
    return this.rolesRepository.save(rol);
  }

  async update(id: string, dto: UpdateRolDto): Promise<Rol> {
    const rol = await this.findOne(id);
    Object.assign(rol, dto);
    return this.rolesRepository.save(rol);
  }

  async remove(id: string): Promise<void> {
    const rol = await this.findOne(id);
    if (rol.esDefault) {
      throw new BadRequestException(
        'No se puede eliminar un rol por defecto del sistema',
      );
    }
    rol.activo = false;
    await this.rolesRepository.save(rol);
  }

  async actualizarPermisos(id: string, permisoIds: string[]): Promise<Rol> {
    const rol = await this.findOne(id);
    const permisosNuevos = await this.permisos.findByIds(permisoIds);
    if (permisosNuevos.length !== permisoIds.length) {
      throw new BadRequestException('Alguno de los permisos indicados no existe');
    }
    const fueraDeTier = permisosNuevos.find((p) => p.tier !== rol.tier);
    if (fueraDeTier) {
      throw new ForbiddenException(
        `El permiso de módulo "${fueraDeTier.modulo}" no corresponde al nivel de este rol`,
      );
    }
    rol.permisos = permisosNuevos;
    return this.rolesRepository.save(rol);
  }

  /** Catálogo de permisos para armar la matriz en el frontend — solo del tier del caller. */
  catalogo(): Promise<Permiso[]> {
    return this.permisos.findAll(this.getTier());
  }

  // --- Sembrado idempotente (usado por seed.ts y por NegociosService.create) ---

  async asegurarRolSistema(): Promise<Rol> {
    const existente = await this.rolesRepository.findOne({
      where: { tier: RolTier.SISTEMA, esDefault: true },
    });
    if (existente) return existente;

    const permisosSistema = await this.permisosRepository.find({
      where: { tier: RolTier.SISTEMA },
    });
    const rol = this.rolesRepository.create({
      nombre: 'Super Administrador',
      tier: RolTier.SISTEMA,
      negocioId: null,
      esDefault: true,
      permisos: permisosSistema,
    });
    return this.rolesRepository.save(rol);
  }

  /** Crea (si faltan) los roles "Administrador"/"Cajero" por defecto de un negocio. Idempotente. */
  async asegurarRolesPorDefecto(
    negocioId: string,
  ): Promise<{ administrador: Rol; cajero: Rol }> {
    const existentes = await this.rolesRepository.find({
      where: { tier: RolTier.NEGOCIO, negocioId, esDefault: true },
    });
    const permisosNegocio = await this.permisosRepository.find({
      where: { tier: RolTier.NEGOCIO },
    });

    let administrador = existentes.find((r) => r.nombre === 'Administrador');
    if (!administrador) {
      administrador = await this.rolesRepository.save(
        this.rolesRepository.create({
          nombre: 'Administrador',
          tier: RolTier.NEGOCIO,
          negocioId,
          esDefault: true,
          permisos: permisosNegocio,
        }),
      );
    }

    let cajero = existentes.find((r) => r.nombre === 'Cajero');
    if (!cajero) {
      const permisosCajero = permisosNegocio.filter((p) =>
        (PERMISOS_CAJERO[p.modulo] ?? []).includes(p.accion),
      );
      cajero = await this.rolesRepository.save(
        this.rolesRepository.create({
          nombre: 'Cajero',
          tier: RolTier.NEGOCIO,
          negocioId,
          esDefault: true,
          permisos: permisosCajero,
        }),
      );
    }

    return { administrador, cajero };
  }
}
