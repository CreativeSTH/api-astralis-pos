import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { sumarDiasColombia } from '../common/utils/fecha-colombia';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Empleado } from './entities/empleado.entity';
import { TurnoProgramado } from './entities/turno-programado.entity';
import { CreateTurnoProgramadoDto, UpdateTurnoProgramadoDto } from './dto/turno-programado.dto';
import { intervaloTurno, lunesDe } from './calculo/tiempo-colombia';

/** 'HH:MM' de un `time` de Postgres ('HH:MM:SS') o de un DTO ('HH:MM'). */
const hhmm = (hora: string) => hora.slice(0, 5);

@Injectable()
export class TurnosProgramadosService extends TenantBaseService<TurnoProgramado> {
  constructor(
    @InjectRepository(TurnoProgramado) repository: Repository<TurnoProgramado>,
    @InjectRepository(Empleado) private readonly empleadoRepo: Repository<Empleado>,
    @InjectRepository(Sucursal) private readonly sucursalRepo: Repository<Sucursal>,
    cls: ClsService,
  ) {
    super(repository, cls, 'Turno');
  }

  listar(desde: string, hasta: string, sucursalId?: string): Promise<TurnoProgramado[]> {
    const where: FindOptionsWhere<TurnoProgramado> = { negocioId: this.getNegocioId(), fecha: Between(desde, hasta) };
    if (sucursalId) where.sucursalId = sucursalId;
    return this.repository.find({
      where,
      relations: { empleado: true },
      select: { empleado: { id: true, nombre: true } },
      order: { fecha: 'ASC', horaInicio: 'ASC' },
    });
  }

  async create(dto: CreateTurnoProgramadoDto): Promise<TurnoProgramado> {
    await this.validarReferencias(dto.empleadoId, dto.sucursalId);
    this.validarHoras(dto.horaInicio, dto.horaFin);
    await this.validarSinSuperposicion(dto.empleadoId, dto.fecha, dto.horaInicio, dto.horaFin);
    return this.createForTenant({ ...dto, nota: dto.nota ?? null });
  }

  async update(id: string, dto: UpdateTurnoProgramadoDto): Promise<TurnoProgramado> {
    const actual = await this.findOneForTenant(id);
    const nuevo = { ...actual, ...dto };
    if (dto.empleadoId || dto.sucursalId) await this.validarReferencias(nuevo.empleadoId, nuevo.sucursalId);
    this.validarHoras(nuevo.horaInicio, nuevo.horaFin);
    await this.validarSinSuperposicion(nuevo.empleadoId, nuevo.fecha, nuevo.horaInicio, nuevo.horaFin, id);
    return this.updateForTenant(id, dto);
  }

  async remove(id: string): Promise<void> {
    const r = await this.repository.delete({ id, negocioId: this.getNegocioId() });
    if (!r.affected) throw new NotFoundException(`Turno con ID ${id} no encontrado`);
  }

  /**
   * Copia los turnos de la semana anterior a la que empieza en `lunesDestino`, desplazados 7 días.
   * Omite los que ya existen idénticos en destino y los que se cruzarían con otro turno.
   */
  async copiarSemana(lunesDestino: string, sucursalId?: string): Promise<{ copiados: number; omitidos: number }> {
    if (lunesDe(lunesDestino) !== lunesDestino) throw new BadRequestException('La semana destino debe empezar un lunes');
    const origen = await this.listar(sumarDiasColombia(lunesDestino, -7), sumarDiasColombia(lunesDestino, -1), sucursalId);
    let copiados = 0;
    let omitidos = 0;
    for (const t of origen) {
      const fecha = sumarDiasColombia(t.fecha, 7);
      const igual = await this.repository.findOne({
        where: { negocioId: this.getNegocioId(), empleadoId: t.empleadoId, fecha, horaInicio: t.horaInicio, horaFin: t.horaFin },
      });
      if (igual) {
        omitidos++;
        continue;
      }
      try {
        await this.validarSinSuperposicion(t.empleadoId, fecha, t.horaInicio, t.horaFin);
      } catch (e) {
        if (!(e instanceof ConflictException)) throw e;
        omitidos++;
        continue;
      }
      await this.createForTenant({
        empleadoId: t.empleadoId,
        sucursalId: t.sucursalId,
        fecha,
        horaInicio: t.horaInicio,
        horaFin: t.horaFin,
        nota: t.nota,
      });
      copiados++;
    }
    return { copiados, omitidos };
  }

  private validarHoras(horaInicio: string, horaFin: string): void {
    if (hhmm(horaInicio) === hhmm(horaFin)) throw new BadRequestException('La hora de inicio y la de fin no pueden ser iguales');
  }

  private async validarReferencias(empleadoId: string, sucursalId: string): Promise<void> {
    const negocioId = this.getNegocioId();
    if (!(await this.empleadoRepo.exists({ where: { id: empleadoId, negocioId, activo: true } }))) {
      throw new BadRequestException('El empleado no existe en este negocio');
    }
    if (!(await this.sucursalRepo.exists({ where: { id: sucursalId, negocioId } }))) {
      throw new BadRequestException('La sucursal no existe en este negocio');
    }
  }

  private async validarSinSuperposicion(
    empleadoId: string,
    fecha: string,
    horaInicio: string,
    horaFin: string,
    exceptoId?: string,
  ): Promise<void> {
    const nuevo = intervaloTurno(fecha, horaInicio, horaFin);
    const vecinos = await this.repository.find({
      where: {
        negocioId: this.getNegocioId(),
        empleadoId,
        fecha: Between(sumarDiasColombia(fecha, -1), sumarDiasColombia(fecha, 1)),
      },
    });
    for (const t of vecinos) {
      if (t.id === exceptoId) continue;
      const i = intervaloTurno(t.fecha, t.horaInicio, t.horaFin);
      if (nuevo.inicio < i.fin && i.inicio < nuevo.fin) {
        throw new ConflictException(`Se cruza con el turno de ${t.fecha} ${hhmm(t.horaInicio)}–${hhmm(t.horaFin)}`);
      }
    }
  }
}
