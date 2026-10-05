import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { Between, FindOptionsWhere, In, Not, IsNull, Repository } from 'typeorm';
import { finDiaColombia, inicioDiaColombia, sumarDiasColombia } from '../common/utils/fecha-colombia';
import { Empleado } from './entities/empleado.entity';
import { Jornada } from './entities/jornada.entity';
import { TurnoProgramado } from './entities/turno-programado.entity';
import { AsistenciaService } from './asistencia.service';
import { AlertaAsistencia } from './asistencia-alertas';
import { AlertaRecargos, TipoHora, calcularRecargos, totalizar } from './calculo/calculo-recargos';
import { lunesDe } from './calculo/tiempo-colombia';
import { FiltrosRecargosDto } from './dto/filtros-recargos.dto';

/** Período máximo de un reporte, para que la consulta no se dispare. */
const MAX_DIAS = 100;

export const NOTA_REPORTE_RECARGOS =
  'Valores de recargos y horas extra según la ley vigente en cada fecha. No incluye salario, seguridad social ni prestaciones. ' +
  'Se usa el salario actual de cada empleado.';

export interface TramoReporte {
  fecha: string;
  inicio: Date;
  fin: Date;
  minutos: number;
  tipo: TipoHora;
  porcentaje: number;
  valor: number;
}

export interface RecargosEmpleado {
  empleado: {
    id: string;
    nombre: string;
    tipoDocumento: string;
    numeroDocumento: string;
    salarioMensual: number;
    aplicaHorasExtra: boolean;
  };
  porTipo: Record<TipoHora, { minutos: number; valor: number }>;
  total: number;
  tramos: TramoReporte[];
  alertas: AlertaRecargos[];
}

export interface ReporteRecargos {
  desde: string;
  hasta: string;
  empleados: RecargosEmpleado[];
  alertasAsistencia: AlertaAsistencia[];
  totalGeneral: number;
  nota: string;
}

/**
 * Reporte de horas extra y recargos en pesos (spec 2026-10-04 turnos §5–§6). Se calcula en cada consulta,
 * no se guarda. Para que las horas extra salgan bien carga las semanas completas (lunes a domingo) que
 * tocan el período y después recorta los tramos a [desde, hasta].
 */
@Injectable()
export class RecargosService {
  constructor(
    @InjectRepository(Empleado) private readonly empleadoRepo: Repository<Empleado>,
    @InjectRepository(Jornada) private readonly jornadaRepo: Repository<Jornada>,
    @InjectRepository(TurnoProgramado) private readonly turnoRepo: Repository<TurnoProgramado>,
    private readonly asistencia: AsistenciaService,
    private readonly cls: ClsService,
  ) {}

  async reporte(f: FiltrosRecargosDto): Promise<ReporteRecargos> {
    const negocioId = this.cls.get<string>('negocioId');
    if (!negocioId) throw new BadRequestException('El reporte es por negocio');
    if (f.hasta < f.desde) throw new BadRequestException('La fecha final debe ser posterior a la inicial');
    if (sumarDiasColombia(f.desde, MAX_DIAS) < f.hasta) {
      throw new BadRequestException(`El período no puede superar ${MAX_DIAS} días`);
    }
    const lunes = lunesDe(f.desde);
    const domingo = sumarDiasColombia(lunesDe(f.hasta), 6);

    const whereJornadas: FindOptionsWhere<Jornada> = {
      negocioId,
      salida: Not(IsNull()),
      // Un día antes del lunes: una jornada del domingo anterior puede terminar ya en la semana.
      entrada: Between(inicioDiaColombia(sumarDiasColombia(lunes, -1)), finDiaColombia(domingo)),
    };
    if (f.empleadoId) whereJornadas.empleadoId = f.empleadoId;
    const jornadas = await this.jornadaRepo.find({ where: whereJornadas, order: { entrada: 'ASC' } });

    // Empleados con alguna jornada en el período (en la sucursal pedida, si la hay).
    const enPeriodo = (j: Jornada) => {
      const inicio = inicioDiaColombia(f.desde).getTime();
      const fin = finDiaColombia(f.hasta).getTime();
      return j.entrada.getTime() <= fin && (j.salida as Date).getTime() >= inicio;
    };
    const ids = [...new Set(jornadas.filter((j) => enPeriodo(j) && (!f.sucursalId || j.sucursalId === f.sucursalId)).map((j) => j.empleadoId))];

    const [empleados, turnos, asistencia] = await Promise.all([
      ids.length ? this.empleadoRepo.find({ where: { negocioId, id: In(ids) }, order: { nombre: 'ASC' } }) : Promise.resolve([]),
      ids.length
        ? this.turnoRepo.find({
            where: { negocioId, empleadoId: In(ids), fecha: Between(sumarDiasColombia(lunes, -1), domingo) },
          })
        : Promise.resolve([]),
      this.asistencia.listar({ desde: f.desde, hasta: f.hasta, empleadoId: f.empleadoId, sucursalId: f.sucursalId }),
    ]);

    const resultado: RecargosEmpleado[] = [];
    for (const e of empleados) {
      const propias = jornadas.filter((j) => j.empleadoId === e.id);
      const sucursalDe = new Map(propias.map((j) => [j.id, j.sucursalId]));
      const calculo = calcularRecargos({
        jornadas: propias.map((j) => ({ id: j.id, entrada: j.entrada, salida: j.salida as Date })),
        turnos: turnos.filter((t) => t.empleadoId === e.id),
        salarioMensual: Number(e.salarioMensual),
        aplicaHorasExtra: e.aplicaHorasExtra,
      });
      const tramos = calculo.tramos.filter(
        (t) => t.fecha >= f.desde && t.fecha <= f.hasta && (!f.sucursalId || sucursalDe.get(t.jornadaId!) === f.sucursalId),
      );
      const alertas = calculo.alertas.filter((a) =>
        a.tipo === 'EXTRA_DIA' ? a.fecha >= f.desde && a.fecha <= f.hasta : a.fecha <= f.hasta && sumarDiasColombia(a.fecha, 6) >= f.desde,
      );
      const { porTipo, total } = totalizar(tramos);
      resultado.push({
        empleado: {
          id: e.id,
          nombre: e.nombre,
          tipoDocumento: e.tipoDocumento,
          numeroDocumento: e.numeroDocumento,
          salarioMensual: Number(e.salarioMensual),
          aplicaHorasExtra: e.aplicaHorasExtra,
        },
        porTipo,
        total,
        tramos: tramos.map((t) => ({
          fecha: t.fecha,
          inicio: t.inicio,
          fin: t.fin,
          minutos: t.minutos,
          tipo: t.tipo,
          porcentaje: t.porcentaje,
          valor: t.valor,
        })),
        alertas,
      });
    }

    return {
      desde: f.desde,
      hasta: f.hasta,
      empleados: resultado,
      alertasAsistencia: asistencia.alertas,
      totalGeneral: resultado.reduce((s, r) => s + r.total, 0),
      nota: NOTA_REPORTE_RECARGOS,
    };
  }
}
