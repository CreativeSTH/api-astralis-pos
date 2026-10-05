import { intervaloTurno, partesColombia } from './calculo/tiempo-colombia';

/** Minutos de gracia antes de considerar tarde una entrada (spec 2026-10-04 §5, Alertas). */
export const TOLERANCIA_TARDE_MIN = 10;

export interface JornadaLite {
  id: string;
  empleadoId: string;
  entrada: Date;
  salida: Date | null;
  sinSalida: boolean;
}

export interface TurnoLite {
  id: string;
  empleadoId: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
}

export interface AlertaAsistencia {
  tipo: 'TARDE' | 'AUSENTE' | 'SIN_SALIDA';
  empleadoId: string;
  fecha: string;
  jornadaId?: string;
  turnoId?: string;
  minutos?: number;
}

/**
 * Compara lo programado con lo marcado. Una jornada cubre un turno si se cruzan en el tiempo;
 * la llegada tarde se mide con la primera jornada que lo cubre.
 */
export function alertasAsistencia(jornadas: JornadaLite[], turnos: TurnoLite[], ahora = new Date()): AlertaAsistencia[] {
  const alertas: AlertaAsistencia[] = [];
  for (const j of jornadas) {
    if (j.sinSalida) {
      alertas.push({ tipo: 'SIN_SALIDA', empleadoId: j.empleadoId, fecha: partesColombia(j.entrada).fecha, jornadaId: j.id });
    }
  }
  for (const t of turnos) {
    const { inicio, fin } = intervaloTurno(t.fecha, t.horaInicio, t.horaFin);
    // Un turno que todavía no empieza (o está dentro de la tolerancia) no puede estar ausente ni tarde.
    if (inicio.getTime() + TOLERANCIA_TARDE_MIN * 60000 > ahora.getTime()) continue;
    const delEmpleado = jornadas.filter((j) => j.empleadoId === t.empleadoId);
    const cruzan = delEmpleado.filter((j) => j.entrada < fin && (j.salida ?? fin) > inicio);
    if (cruzan.length === 0) {
      alertas.push({ tipo: 'AUSENTE', empleadoId: t.empleadoId, fecha: t.fecha, turnoId: t.id });
      continue;
    }
    const primera = cruzan.reduce((a, b) => (a.entrada < b.entrada ? a : b));
    const tarde = (primera.entrada.getTime() - inicio.getTime()) / 60000;
    if (tarde > TOLERANCIA_TARDE_MIN) {
      alertas.push({
        tipo: 'TARDE',
        empleadoId: t.empleadoId,
        fecha: t.fecha,
        turnoId: t.id,
        jornadaId: primera.id,
        minutos: Math.round(tarde),
      });
    }
  }
  return alertas;
}
