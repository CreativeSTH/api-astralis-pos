import {
  EXTRA_DIURNA,
  EXTRA_NOCTURNA,
  FIN_NOCTURNO_MIN,
  INICIO_NOCTURNO,
  JORNADA_SEMANAL,
  MAX_EXTRA_DIA_MIN,
  MAX_EXTRA_SEMANA_MIN,
  RECARGO_DOMINICAL,
  RECARGO_NOCTURNO,
  divisorHora,
  valorVigente,
} from './parametros-laborales';
import { esDominicalOFestivo } from './festivos-colombia';
import { instanteColombia, intervaloTurno, lunesDe, partesColombia } from './tiempo-colombia';

/**
 * Motor puro del cálculo de horas extra y recargos (spec 2026-10-04 turnos §5). Sin base de datos: recibe
 * las jornadas cerradas y los turnos programados de UN empleado y devuelve los tramos clasificados y los
 * valores en pesos. Para que las horas extra salgan bien hay que pasarle semanas completas (lunes a domingo).
 */
export type TipoHora =
  | 'ORDINARIA_DIURNA'
  | 'ORDINARIA_NOCTURNA'
  | 'ORDINARIA_DIURNA_DOMINICAL'
  | 'ORDINARIA_NOCTURNA_DOMINICAL'
  | 'EXTRA_DIURNA'
  | 'EXTRA_NOCTURNA'
  | 'EXTRA_DIURNA_DOMINICAL'
  | 'EXTRA_NOCTURNA_DOMINICAL';

export const TIPOS_HORA: readonly TipoHora[] = [
  'ORDINARIA_DIURNA',
  'ORDINARIA_NOCTURNA',
  'ORDINARIA_DIURNA_DOMINICAL',
  'ORDINARIA_NOCTURNA_DOMINICAL',
  'EXTRA_DIURNA',
  'EXTRA_NOCTURNA',
  'EXTRA_DIURNA_DOMINICAL',
  'EXTRA_NOCTURNA_DOMINICAL',
];

export interface EntradaCalculo {
  /** Solo jornadas cerradas. `id` opcional: se copia a cada tramo (p. ej. para filtrar por sucursal después). */
  jornadas: { entrada: Date; salida: Date; id?: string }[];
  turnos: { fecha: string; horaInicio: string; horaFin: string }[];
  salarioMensual: number;
  aplicaHorasExtra: boolean;
}

export interface TramoCalculado {
  jornadaId?: string;
  /** Día en hora Colombia. */
  fecha: string;
  inicio: Date;
  fin: Date;
  minutos: number;
  nocturno: boolean;
  dominical: boolean;
  /** El tramo cae dentro de un turno programado. */
  dentroDeTurno: boolean;
  extra: boolean;
  tipo: TipoHora;
  porcentaje: number;
  valorHora: number;
  /** Sin redondear. */
  valor: number;
}

export interface AlertaRecargos {
  tipo: 'EXTRA_DIA' | 'EXTRA_SEMANA';
  /** El día, o el lunes de la semana. */
  fecha: string;
  minutos: number;
}

export interface ResultadoCalculo {
  tramos: TramoCalculado[];
  /** Valor redondeado al peso por tipo. */
  porTipo: Record<TipoHora, { minutos: number; valor: number }>;
  total: number;
  alertas: AlertaRecargos[];
}

const MIN_MS = 60_000;
const DIA_MS = 24 * 3600 * 1000;

type Intervalo = { inicio: Date; fin: Date };

export function calcularRecargos(e: EntradaCalculo): ResultadoCalculo {
  const turnos = e.turnos.map((t) => intervaloTurno(t.fecha, t.horaInicio, t.horaFin));
  let tramos: TramoCalculado[] = [];
  for (const j of e.jornadas) {
    if (j.salida.getTime() > j.entrada.getTime()) tramos.push(...cortar(j.entrada, j.salida, turnos, j.id));
  }
  if (e.aplicaHorasExtra) tramos = marcarExtras(tramos);
  tramos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  for (const t of tramos) clasificar(t, e.salarioMensual);
  return totalizar(tramos, e.aplicaHorasExtra ? alertasExtra(tramos) : []);
}

/** Totales por tipo (valor redondeado al peso por tipo) de una lista de tramos ya clasificados. */
export function totalizar(tramos: TramoCalculado[], alertas: AlertaRecargos[] = []): ResultadoCalculo {
  const porTipo = Object.fromEntries(TIPOS_HORA.map((t) => [t, { minutos: 0, valor: 0 }])) as ResultadoCalculo['porTipo'];
  for (const t of tramos) {
    porTipo[t.tipo].minutos += t.minutos;
    porTipo[t.tipo].valor += t.valor;
  }
  let total = 0;
  for (const tipo of TIPOS_HORA) {
    porTipo[tipo].minutos = Math.round(porTipo[tipo].minutos * 100) / 100;
    porTipo[tipo].valor = Math.round(porTipo[tipo].valor);
    total += porTipo[tipo].valor;
  }
  return { tramos, porTipo, total, alertas };
}

/**
 * Corta la jornada en tramos homogéneos: en la medianoche, a las 06:00, al inicio de la franja nocturna
 * vigente ese día y en cada borde de turno programado.
 */
function cortar(entrada: Date, salida: Date, turnos: Intervalo[], jornadaId?: string): TramoCalculado[] {
  const tramos: TramoCalculado[] = [];
  let cursor = entrada;
  while (cursor < salida) {
    const { fecha, minutosDelDia } = partesColombia(cursor);
    const inicioNocturno = valorVigente(INICIO_NOCTURNO, fecha);
    const inicioDia = instanteColombia(fecha, '00:00').getTime();
    const cortes = [
      salida.getTime(),
      inicioDia + DIA_MS,
      inicioDia + FIN_NOCTURNO_MIN * MIN_MS,
      inicioDia + inicioNocturno * MIN_MS,
      ...turnos.flatMap((t) => [t.inicio.getTime(), t.fin.getTime()]),
    ].filter((c) => c > cursor.getTime());
    const fin = new Date(Math.min(...cortes));
    const medio = (cursor.getTime() + fin.getTime()) / 2;
    tramos.push({
      jornadaId,
      fecha,
      inicio: cursor,
      fin,
      minutos: (fin.getTime() - cursor.getTime()) / MIN_MS,
      nocturno: minutosDelDia >= inicioNocturno || minutosDelDia < FIN_NOCTURNO_MIN,
      dominical: esDominicalOFestivo(fecha),
      dentroDeTurno: turnos.some((t) => t.inicio.getTime() <= medio && medio < t.fin.getTime()),
      extra: false,
      tipo: 'ORDINARIA_DIURNA',
      porcentaje: 0,
      valorHora: 0,
      valor: 0,
    });
    cursor = fin;
  }
  return tramos;
}

/**
 * Por semana (lunes a domingo): si lo trabajado supera la jornada máxima vigente el lunes, el exceso se
 * toma del tiempo trabajado FUERA de los turnos programados, empezando por lo más tardío de la semana.
 * Si un tramo cubre de más, se parte y solo su parte final es extra.
 */
function marcarExtras(tramos: TramoCalculado[]): TramoCalculado[] {
  const semanas = new Map<string, TramoCalculado[]>();
  for (const t of tramos) {
    const lunes = lunesDe(t.fecha);
    semanas.set(lunes, [...(semanas.get(lunes) ?? []), t]);
  }
  const resultado: TramoCalculado[] = [];
  for (const [lunes, deLaSemana] of semanas) {
    const trabajado = deLaSemana.reduce((s, t) => s + t.minutos, 0);
    let exceso = trabajado - valorVigente(JORNADA_SEMANAL, lunes) * 60;
    const candidatos = deLaSemana.filter((t) => !t.dentroDeTurno).sort((a, b) => b.inicio.getTime() - a.inicio.getTime());
    for (const t of candidatos) {
      if (exceso <= 1e-9) break;
      if (t.minutos <= exceso) {
        t.extra = true;
        exceso -= t.minutos;
        continue;
      }
      const corte = new Date(t.fin.getTime() - exceso * MIN_MS);
      deLaSemana.push({ ...t, inicio: corte, minutos: exceso, extra: true });
      t.fin = corte;
      t.minutos -= exceso;
      exceso = 0;
    }
    resultado.push(...deLaSemana);
  }
  return resultado;
}

/** CST art. 162: más de 2 h extra en un día o de 12 en la semana. Informativas. */
function alertasExtra(tramos: TramoCalculado[]): AlertaRecargos[] {
  const porDia = new Map<string, number>();
  const porSemana = new Map<string, number>();
  for (const t of tramos.filter((x) => x.extra)) {
    porDia.set(t.fecha, (porDia.get(t.fecha) ?? 0) + t.minutos);
    const lunes = lunesDe(t.fecha);
    porSemana.set(lunes, (porSemana.get(lunes) ?? 0) + t.minutos);
  }
  const alertas: AlertaRecargos[] = [];
  for (const [fecha, min] of porDia) {
    if (min > MAX_EXTRA_DIA_MIN) alertas.push({ tipo: 'EXTRA_DIA', fecha, minutos: Math.round(min) });
  }
  for (const [fecha, min] of porSemana) {
    if (min > MAX_EXTRA_SEMANA_MIN) alertas.push({ tipo: 'EXTRA_SEMANA', fecha, minutos: Math.round(min) });
  }
  return alertas;
}

function clasificar(t: TramoCalculado, salarioMensual: number): void {
  const base = t.nocturno ? (t.extra ? EXTRA_NOCTURNA : RECARGO_NOCTURNO) : t.extra ? EXTRA_DIURNA : 0;
  t.porcentaje = base + (t.dominical ? valorVigente(RECARGO_DOMINICAL, t.fecha) : 0);
  t.valorHora = salarioMensual / divisorHora(t.fecha);
  t.valor = (t.minutos / 60) * t.valorHora * t.porcentaje;
  t.tipo = `${t.extra ? 'EXTRA' : 'ORDINARIA'}_${t.nocturno ? 'NOCTURNA' : 'DIURNA'}${t.dominical ? '_DOMINICAL' : ''}` as TipoHora;
}
