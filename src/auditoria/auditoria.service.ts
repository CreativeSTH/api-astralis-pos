import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  diaColombia,
  finDiaColombia,
  inicioDiaColombia,
  sumarDiasColombia,
} from '../common/utils/fecha-colombia';
import {
  FiltrosAuditoriaDto,
  PaginacionAuditoriaDto,
} from './dto/filtros-auditoria.dto';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { CambioAuditoria, ClaseEntidad } from './auditoria.types';
import { opcionesAuditable } from './auditable.decorator';
import { camposCambiados } from './auditoria-diff';
import {
  armarRegistro,
  FilaAuditable,
  resolverEtiquetas,
} from './auditoria-registro';
import {
  CLS_NOMBRE_USUARIO_AUDITORIA,
  leerContextoAuditoria,
} from './contexto-auditoria';
import { RegistroAuditoria } from './entities/registro-auditoria.entity';
import { AccionAuditoria } from './enums/accion-auditoria.enum';

export interface DatosRegistro {
  negocioId: string;
  modulo: ModuloPermiso;
  entidad: string;
  entidadId: string;
  entidadEtiqueta: string;
  accion: AccionAuditoria;
  descripcion: string;
  cambios: CambioAuditoria[] | null;
}

export interface RegistrarAccionInput {
  modulo: ModuloPermiso;
  entidad: string;
  entidadId: string;
  etiqueta: string;
  accion: AccionAuditoria;
  descripcion: string;
  cambios?: CambioAuditoria[];
  /** El de la transacción del cambio: si ésta hace rollback, el registro también desaparece. */
  manager?: EntityManager;
  /** Default: el del contexto CLS. */
  negocioId?: string;
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(
    @InjectRepository(RegistroAuditoria)
    private readonly registros: Repository<RegistroAuditoria>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly cls: ClsService,
  ) {}

  /** Punto único de escritura (subscriber y acciones explícitas). `insert` y no `save`: no re-dispara la auditoría. */
  async escribir(manager: EntityManager, datos: DatosRegistro): Promise<void> {
    const contexto = leerContextoAuditoria(this.cls);
    await manager.insert(RegistroAuditoria, {
      ...datos,
      origen: contexto.origen,
      usuarioId: contexto.usuarioId,
      usuarioNombre: contexto.usuarioId
        ? await this.nombreUsuario(manager, contexto.usuarioId)
        : null,
      sucursalId: contexto.sucursalId,
    });
  }

  async registrarAccion(input: RegistrarAccionInput): Promise<void> {
    const negocioId =
      input.negocioId ?? leerContextoAuditoria(this.cls).negocioId;
    if (!negocioId) {
      this.logger.warn(
        `Acción ${input.accion} sobre ${input.entidad} ${input.entidadId} sin negocio: no se audita`,
      );
      return;
    }
    await this.escribir(input.manager ?? this.dataSource.manager, {
      negocioId,
      modulo: input.modulo,
      entidad: input.entidad,
      entidadId: input.entidadId,
      entidadEtiqueta: input.etiqueta,
      accion: input.accion,
      descripcion: input.descripcion,
      cambios: input.cambios?.length ? input.cambios : null,
    });
  }

  private negocioActual(): string {
    const negocioId = this.cls.get<string | undefined>('negocioId');
    if (!negocioId) throw new ForbiddenException('La auditoría es por negocio');
    return negocioId;
  }

  async consultar(f: FiltrosAuditoriaDto) {
    const negocioId = this.negocioActual();
    const pagina = f.pagina ?? 1;
    const porPagina = f.porPagina ?? 50;
    const qb = this.registros
      .createQueryBuilder('r')
      .where('r.negocioId = :negocioId', { negocioId });

    // El historial de un registro puntual muestra todo; la pantalla central, por defecto la última semana.
    const desde =
      f.desde ??
      (f.entidadId ? undefined : sumarDiasColombia(diaColombia(), -6));
    if (desde)
      qb.andWhere('r.createdAt >= :desde', { desde: inicioDiaColombia(desde) });
    if (f.hasta)
      qb.andWhere('r.createdAt <= :hasta', { hasta: finDiaColombia(f.hasta) });
    if (f.usuarioId)
      qb.andWhere('r.usuarioId = :usuarioId', { usuarioId: f.usuarioId });
    if (f.modulo) qb.andWhere('r.modulo = :modulo', { modulo: f.modulo });
    if (f.accion) qb.andWhere('r.accion = :accion', { accion: f.accion });
    if (f.entidad) qb.andWhere('r.entidad = :entidad', { entidad: f.entidad });
    if (f.entidadId)
      qb.andWhere('r.entidadId = :entidadId', { entidadId: f.entidadId });
    const buscar = f.buscar?.trim();
    if (buscar) {
      qb.andWhere(
        '(r.entidadEtiqueta ILIKE :buscar OR r.descripcion ILIKE :buscar)',
        {
          buscar: `%${buscar.replace(/[%_\\]/g, '\\$&')}%`,
        },
      );
    }

    const [items, total] = await qb
      .orderBy('r.createdAt', 'DESC')
      .skip((pagina - 1) * porPagina)
      .take(porPagina)
      .getManyAndCount();
    return { items, total, pagina, porPagina };
  }

  historial(entidad: string, entidadId: string, p: PaginacionAuditoriaDto) {
    return this.consultar({
      entidad,
      entidadId,
      pagina: p.pagina,
      porPagina: p.porPagina ?? 20,
    });
  }

  /** Usuarios que aparecen en la auditoría (incluye desactivados): opciones del filtro. */
  usuarios(): Promise<{ id: string; nombre: string }[]> {
    return this.registros
      .createQueryBuilder('r')
      .select('r.usuarioId', 'id')
      .addSelect('MAX(r.usuarioNombre)', 'nombre')
      .where('r.negocioId = :negocioId', { negocioId: this.negocioActual() })
      .andWhere('r.usuarioId IS NOT NULL')
      .groupBy('r.usuarioId')
      .orderBy('nombre', 'ASC')
      .getRawMany<{ id: string; nombre: string }>();
  }

  /**
   * Relaciones muchos-a-muchos de una entidad `@Auditable` (categorías de un producto, alcance de
   * una promoción): el subscriber no las ve si solo cambia la tabla de unión. `antes` debe tener las
   * relaciones cargadas antes del save; `despues` es la entidad guardada.
   */
  async registrarRelacionesMultiples(
    clase: ClaseEntidad,
    entidadAntes: object,
    entidadDespues: object,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    const opciones = opcionesAuditable(clase);
    if (!opciones) return;
    const antes = entidadAntes as FilaAuditable;
    const despues = entidadDespues as FilaAuditable;
    const { campos } = camposCambiados(
      opciones,
      antes,
      despues,
      'relacionesMultiples',
    );
    if (campos.length === 0) return;
    const etiquetas = await resolverEtiquetas(manager, campos);
    const datos = armarRegistro(
      opciones,
      clase,
      { ...antes, ...despues },
      AccionAuditoria.EDITAR,
      campos,
      [],
      etiquetas,
    );
    if (datos) await this.escribir(manager, datos);
  }

  private async nombreUsuario(
    manager: EntityManager,
    usuarioId: string,
  ): Promise<string | null> {
    const enCache = this.cls.isActive()
      ? this.cls.get<string | undefined>(CLS_NOMBRE_USUARIO_AUDITORIA)
      : undefined;
    if (enCache) return enCache;
    const usuario = await manager.findOne(Usuario, {
      where: { id: usuarioId },
      select: { id: true, nombre: true },
    });
    const nombre = usuario?.nombre ?? null;
    if (nombre && this.cls.isActive())
      this.cls.set(CLS_NOMBRE_USUARIO_AUDITORIA, nombre);
    return nombre;
  }
}
