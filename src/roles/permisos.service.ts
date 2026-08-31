import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permiso } from './entities/permiso.entity';
import { Rol } from './entities/rol.entity';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { RolTier } from '../common/enums/rol-tier.enum';
import { PERMISOS_CAJERO } from './permisos-cajero.constant';

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

  /**
   * Crea las filas del catálogo (módulos × 4 acciones) que falten, e idempotentemente
   * las agrega también a los roles "Administrador" ya existentes de cada negocio — si
   * no se hiciera esto, un módulo agregado después de que un negocio ya tenía su rol
   * Administrador creado quedaría invisible para ese negocio hasta que alguien lo
   * tocara a mano desde /roles.
   *
   * Además reconcilia "Cajero" contra el catálogo COMPLETO (no solo lo recién creado
   * en esta corrida): a diferencia de Administrador, Cajero solo recibe un subconjunto
   * (`PERMISOS_CAJERO`), así que un negocio creado antes de que un módulo existiera
   * pudo quedar con su rol Cajero desactualizado incluso si el catálogo global ya tenía
   * esas filas (agregadas por la creación de otro negocio, o por una corrida anterior de
   * este método) — depender de "nuevos" habría dejado ese caso sin arreglar para siempre.
   */
  async sembrarCatalogo(): Promise<void> {
    const existentes = await this.permisosRepository.find();
    const existeSet = new Set(existentes.map((p) => `${p.modulo}:${p.accion}`));
    const nuevos: Partial<Permiso>[] = [];
    for (const modulo of Object.values(ModuloPermiso)) {
      const tier =
        modulo === ModuloPermiso.NEGOCIOS || modulo === ModuloPermiso.PAQUETES
          ? RolTier.SISTEMA
          : RolTier.NEGOCIO;
      for (const accion of Object.values(AccionPermiso)) {
        const key = `${modulo}:${accion}`;
        if (!existeSet.has(key)) {
          nuevos.push({ modulo, accion, tier });
        }
      }
    }
    const guardados =
      nuevos.length > 0 ? await this.permisosRepository.save(nuevos as Permiso[]) : [];
    const catalogoCompleto = [...existentes, ...guardados];
    const nuevosDeNegocio = guardados.filter((p) => p.tier === RolTier.NEGOCIO);

    if (nuevosDeNegocio.length > 0) {
      const administradores = await this.rolesRepository.find({
        where: {
          tier: RolTier.NEGOCIO,
          esDefault: true,
          nombre: 'Administrador',
        },
        relations: { permisos: true },
      });
      for (const rol of administradores) {
        rol.permisos = [...rol.permisos, ...nuevosDeNegocio];
      }
      if (administradores.length > 0) {
        await this.rolesRepository.save(administradores);
      }
    }

    const nuevosDeSistema = guardados.filter((p) => p.tier === RolTier.SISTEMA);
    if (nuevosDeSistema.length > 0) {
      const superAdmins = await this.rolesRepository.find({
        where: { tier: RolTier.SISTEMA, esDefault: true, nombre: 'Super Administrador' },
        relations: { permisos: true },
      });
      for (const rol of superAdmins) {
        rol.permisos = [...rol.permisos, ...nuevosDeSistema];
      }
      if (superAdmins.length > 0) {
        await this.rolesRepository.save(superAdmins);
      }
    }

    const permisosCajeroCompletos = catalogoCompleto.filter(
      (p) =>
        p.tier === RolTier.NEGOCIO &&
        (PERMISOS_CAJERO[p.modulo] ?? []).includes(p.accion),
    );
    if (permisosCajeroCompletos.length === 0) return;

    const cajeros = await this.rolesRepository.find({
      where: {
        tier: RolTier.NEGOCIO,
        esDefault: true,
        nombre: 'Cajero',
      },
      relations: { permisos: true },
    });
    let huboCambiosEnCajero = false;
    for (const rol of cajeros) {
      const idsActuales = new Set(rol.permisos.map((p) => p.id));
      const faltantes = permisosCajeroCompletos.filter((p) => !idsActuales.has(p.id));
      if (faltantes.length > 0) {
        rol.permisos = [...rol.permisos, ...faltantes];
        huboCambiosEnCajero = true;
      }
    }
    if (huboCambiosEnCajero) {
      await this.rolesRepository.save(cajeros);
    }
  }
}
