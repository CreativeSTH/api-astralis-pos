import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { Between, DataSource, FindOptionsWhere, IsNull, QueryFailedError, Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/enums/accion-auditoria.enum';
import { CambioAuditoria } from '../auditoria/auditoria.types';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { finDiaColombia, inicioDiaColombia } from '../common/utils/fecha-colombia';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Empleado } from './entities/empleado.entity';
import { Jornada } from './entities/jornada.entity';
import { TurnoProgramado } from './entities/turno-programado.entity';
import { OrigenMarca } from './enums';
import { EmpleadosService } from './empleados.service';
import { AlertaAsistencia, alertasAsistencia } from './asistencia-alertas';
import { OFFSET_COLOMBIA_MS, partesColombia } from './calculo/tiempo-colombia';
import { ResultadoMarca } from './dto/marcar.dto';
import { CorregirJornadaDto, CrearJornadaDto, FiltrosAsistenciaDto } from './dto/jornada.dto';

const MIN_ENTRE_MARCAS_MS = 2 * 60 * 1000;
const MAX_JORNADA_ABIERTA_MS = 16 * 3600 * 1000;
/** Una jornada manual o corregida no puede durar más que esto. */
const MAX_JORNADA_MANUAL_MS = 24 * 3600 * 1000;
const MAX_FALLOS = 5;
const BLOQUEO_MS = 60 * 1000;

export interface ListadoAsistencia {
  jornadas: Jornada[];
  turnos: TurnoProgramado[];
  alertas: AlertaAsistencia[];
}

/** 'YYYY-MM-DD HH:MM' en hora Colombia, para la auditoría. */
function horaLegible(d: Date | null): string | null {
  return d ? new Date(d.getTime() - OFFSET_COLOMBIA_MS).toISOString().slice(0, 16).replace('T', ' ') : null;
}

@Injectable()
export class AsistenciaService {
  /** Fallos de PIN por sesión (usuarioId): protección contra adivinar PINs (spec §4). */
  private readonly fallos = new Map<string, { cuenta: number; hasta?: number }>();

  constructor(
    @InjectRepository(Jornada) private readonly jornadaRepo: Repository<Jornada>,
    @InjectRepository(TurnoProgramado) private readonly turnoRepo: Repository<TurnoProgramado>,
    @InjectRepository(Empleado) private readonly empleadoRepo: Repository<Empleado>,
    @InjectRepository(Sucursal) private readonly sucursalRepo: Repository<Sucursal>,
    private readonly empleados: EmpleadosService,
    private readonly dataSource: DataSource,
    private readonly cls: ClsService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Entrada o salida según el estado del empleado; la hora es siempre la del servidor. */
  async marcar(pin: string, sucursalId: string): Promise<ResultadoMarca> {
    const negocioId = this.cls.get<string>('negocioId');
    const sesion = this.cls.get<string>('usuarioId');
    this.verificarBloqueo(sesion);
    if (!(await this.sucursalRepo.exists({ where: { id: sucursalId, negocioId } }))) {
      throw new BadRequestException('La sucursal no existe en este negocio');
    }
    const empleado = await this.empleados.buscarPorPin(negocioId, pin);
    if (!empleado) {
      this.registrarFallo(sesion);
      throw new BadRequestException('PIN inválido');
    }
    this.fallos.delete(sesion);
    const ahora = new Date();
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Jornada);
        const abierta = await repo.findOne({
          where: { negocioId, empleadoId: empleado.id, salida: IsNull(), sinSalida: false },
          lock: { mode: 'pessimistic_write' },
        });
        const resumen = { id: empleado.id, nombre: empleado.nombre };
        if (abierta) {
          const transcurrido = ahora.getTime() - abierta.entrada.getTime();
          if (transcurrido < MIN_ENTRE_MARCAS_MS) throw new ConflictException('Ya marcaste hace un momento');
          if (transcurrido <= MAX_JORNADA_ABIERTA_MS) {
            abierta.salida = ahora;
            abierta.origenSalida = OrigenMarca.PIN;
            await repo.save(abierta);
            return { tipo: 'SALIDA', empleado: resumen, momento: ahora, duracionMinutos: Math.round(transcurrido / 60000) };
          }
          abierta.sinSalida = true;
          await repo.save(abierta);
        }
        await repo.save(
          repo.create({ negocioId, empleadoId: empleado.id, sucursalId, entrada: ahora, origenEntrada: OrigenMarca.PIN }),
        );
        return { tipo: 'ENTRADA', empleado: resumen, momento: ahora };
      });
    } catch (error) {
      // Dos marcas simultáneas del mismo empleado: el índice único de jornada abierta frena la segunda.
      if (error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === '23505') {
        throw new ConflictException('Ya marcaste hace un momento');
      }
      throw error;
    }
  }

  async listar(f: FiltrosAsistenciaDto): Promise<ListadoAsistencia> {
    const negocioId = this.negocioId();
    const base: FindOptionsWhere<Jornada> = { negocioId };
    if (f.empleadoId) base.empleadoId = f.empleadoId;
    // Sin filtro de sucursal: un empleado que marcó en otra sede sí cumplió su turno.
    const todas = await this.jornadaRepo.find({
      where: [
        { ...base, entrada: Between(inicioDiaColombia(f.desde), finDiaColombia(f.hasta)) },
        { ...base, salida: IsNull(), sinSalida: false },
      ],
      relations: { empleado: true, sucursal: true },
      select: { empleado: { id: true, nombre: true }, sucursal: { id: true, nombre: true } },
      order: { entrada: 'DESC' },
    });
    const whereTurnos: FindOptionsWhere<TurnoProgramado> = { negocioId, fecha: Between(f.desde, f.hasta) };
    if (f.empleadoId) whereTurnos.empleadoId = f.empleadoId;
    if (f.sucursalId) whereTurnos.sucursalId = f.sucursalId;
    const turnos = await this.turnoRepo.find({
      where: whereTurnos,
      relations: { empleado: true },
      select: { empleado: { id: true, nombre: true } },
      order: { fecha: 'ASC', horaInicio: 'ASC' },
    });
    return {
      jornadas: f.sucursalId ? todas.filter((j) => j.sucursalId === f.sucursalId) : todas,
      turnos,
      alertas: alertasAsistencia(todas, turnos),
    };
  }

  async crearManual(dto: CrearJornadaDto): Promise<Jornada> {
    const negocioId = this.negocioId();
    const empleado = await this.empleadoDelNegocio(dto.empleadoId);
    if (!(await this.sucursalRepo.exists({ where: { id: dto.sucursalId, negocioId } }))) {
      throw new BadRequestException('La sucursal no existe en este negocio');
    }
    const entrada = new Date(dto.entrada);
    const salida = dto.salida ? new Date(dto.salida) : null;
    this.validarHorario(entrada, salida);
    await this.validarSinSuperposicion(dto.empleadoId, entrada, salida);
    const guardada = await this.jornadaRepo.save(
      this.jornadaRepo.create({
        negocioId,
        empleadoId: dto.empleadoId,
        sucursalId: dto.sucursalId,
        entrada,
        salida,
        origenEntrada: OrigenMarca.MANUAL,
        origenSalida: salida ? OrigenMarca.MANUAL : null,
        corregidaPor: this.cls.get<string>('usuarioId') ?? null,
        motivoCorreccion: dto.motivo,
      }),
    );
    await this.auditar(guardada, empleado.nombre, AccionAuditoria.CREAR, `Agregó una jornada manual. Motivo: ${dto.motivo}`, [
      { campo: 'entrada', etiqueta: 'Entrada', antes: null, despues: horaLegible(entrada) },
      ...(salida ? [{ campo: 'salida', etiqueta: 'Salida', antes: null, despues: horaLegible(salida) }] : []),
    ]);
    return guardada;
  }

  async corregir(id: string, dto: CorregirJornadaDto): Promise<Jornada> {
    const jornada = await this.jornadaDelNegocio(id);
    const empleado = await this.empleadoDelNegocio(jornada.empleadoId);
    const entrada = dto.entrada ? new Date(dto.entrada) : jornada.entrada;
    const salida = dto.salida ? new Date(dto.salida) : jornada.salida;
    this.validarHorario(entrada, salida);
    await this.validarSinSuperposicion(jornada.empleadoId, entrada, salida, id);

    const cambios: CambioAuditoria[] = [];
    if (entrada.getTime() !== jornada.entrada.getTime()) {
      cambios.push({ campo: 'entrada', etiqueta: 'Entrada', antes: horaLegible(jornada.entrada), despues: horaLegible(entrada) });
      jornada.entrada = entrada;
      jornada.origenEntrada = OrigenMarca.MANUAL;
    }
    if (salida && salida.getTime() !== jornada.salida?.getTime()) {
      cambios.push({ campo: 'salida', etiqueta: 'Salida', antes: horaLegible(jornada.salida), despues: horaLegible(salida) });
      jornada.salida = salida;
      jornada.origenSalida = OrigenMarca.MANUAL;
      jornada.sinSalida = false;
    }
    if (cambios.length === 0) throw new BadRequestException('No hay cambios para guardar');
    jornada.corregidaPor = this.cls.get<string>('usuarioId') ?? null;
    jornada.motivoCorreccion = dto.motivo;
    const guardada = await this.jornadaRepo.save(jornada);
    await this.auditar(guardada, empleado.nombre, AccionAuditoria.EDITAR, `Corrigió la jornada. Motivo: ${dto.motivo}`, cambios);
    return guardada;
  }

  /** Borrado físico: son marcas erróneas, no datos de negocio. El motivo queda en la auditoría. */
  async eliminar(id: string, motivo: string): Promise<void> {
    const jornada = await this.jornadaDelNegocio(id);
    const empleado = await this.empleadoDelNegocio(jornada.empleadoId);
    await this.jornadaRepo.delete({ id, negocioId: jornada.negocioId });
    await this.auditar(jornada, empleado.nombre, AccionAuditoria.ELIMINAR, `Eliminó la jornada. Motivo: ${motivo}`, [
      { campo: 'entrada', etiqueta: 'Entrada', antes: horaLegible(jornada.entrada), despues: null },
      { campo: 'salida', etiqueta: 'Salida', antes: horaLegible(jornada.salida), despues: null },
    ]);
  }

  private verificarBloqueo(sesion: string): void {
    const f = this.fallos.get(sesion);
    if (!f?.hasta) return;
    if (f.hasta > Date.now()) {
      throw new HttpException('Demasiados intentos, espera un minuto', HttpStatus.TOO_MANY_REQUESTS);
    }
    this.fallos.delete(sesion);
  }

  private registrarFallo(sesion: string): void {
    const f = this.fallos.get(sesion) ?? { cuenta: 0 };
    f.cuenta++;
    if (f.cuenta >= MAX_FALLOS) f.hasta = Date.now() + BLOQUEO_MS;
    this.fallos.set(sesion, f);
  }

  private validarHorario(entrada: Date, salida: Date | null): void {
    if (entrada.getTime() > Date.now()) throw new BadRequestException('La entrada no puede estar en el futuro');
    if (!salida) return;
    if (salida.getTime() <= entrada.getTime()) throw new BadRequestException('La salida debe ser posterior a la entrada');
    if (salida.getTime() > Date.now()) throw new BadRequestException('La salida no puede estar en el futuro');
    if (salida.getTime() - entrada.getTime() > MAX_JORNADA_MANUAL_MS) {
      throw new BadRequestException('Una jornada no puede durar más de 24 horas');
    }
  }

  /**
   * Una jornada abierta ocupa hasta "ahora"; una `sinSalida` solo ocupa su instante de entrada
   * (la salida real es desconocida y justamente se va a corregir).
   */
  private async validarSinSuperposicion(empleadoId: string, entrada: Date, salida: Date | null, exceptoId?: string) {
    const negocioId = this.negocioId();
    const fin = salida ?? new Date(Math.max(Date.now(), entrada.getTime() + 1));
    const vecinas = await this.jornadaRepo.find({
      where: [
        { negocioId, empleadoId, entrada: Between(new Date(entrada.getTime() - MAX_JORNADA_MANUAL_MS), fin) },
        { negocioId, empleadoId, salida: IsNull(), sinSalida: false },
      ],
    });
    for (const j of vecinas) {
      if (j.id === exceptoId) continue;
      if (!salida && !j.salida && !j.sinSalida) throw new ConflictException('El empleado ya tiene una jornada abierta');
      const jFin = j.salida ?? (j.sinSalida ? j.entrada : new Date(Date.now()));
      const choca = j.sinSalida && !j.salida ? entrada < j.entrada && j.entrada < fin : entrada < jFin && j.entrada < fin;
      if (choca) {
        throw new ConflictException(
          `Se cruza con la jornada del ${horaLegible(j.entrada)}${j.salida ? ` a ${horaLegible(j.salida)!.slice(11)}` : ''}`,
        );
      }
    }
  }

  private async jornadaDelNegocio(id: string): Promise<Jornada> {
    const jornada = await this.jornadaRepo.findOne({ where: { id, negocioId: this.negocioId() } });
    if (!jornada) throw new NotFoundException('Jornada no encontrada');
    return jornada;
  }

  private async empleadoDelNegocio(id: string): Promise<Empleado> {
    const empleado = await this.empleadoRepo.findOne({ where: { id, negocioId: this.negocioId() } });
    if (!empleado) throw new BadRequestException('El empleado no existe en este negocio');
    return empleado;
  }

  private auditar(j: Jornada, nombre: string, accion: AccionAuditoria, descripcion: string, cambios: CambioAuditoria[]) {
    return this.auditoria.registrarAccion({
      modulo: ModuloPermiso.EMPLEADOS,
      entidad: 'Jornada',
      entidadId: j.id,
      etiqueta: `${nombre} ${partesColombia(j.entrada).fecha}`,
      accion,
      descripcion,
      cambios,
    });
  }

  private negocioId(): string {
    const negocioId = this.cls.get<string>('negocioId');
    if (!negocioId) throw new BadRequestException('La asistencia es por negocio');
    return negocioId;
  }
}
