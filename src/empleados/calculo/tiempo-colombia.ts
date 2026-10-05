/** Colombia es UTC−5 fijo, sin horario de verano. */
export const OFFSET_COLOMBIA_MS = 5 * 3600 * 1000;

/** Instante UTC de 'YYYY-MM-DD' + 'HH:MM[:SS]' en hora Colombia. */
export function instanteColombia(fecha: string, hora: string): Date {
  const [h, m, s = '0'] = hora.split(':');
  const [a, mes, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, mes - 1, d, Number(h), Number(m), Number(s)) + OFFSET_COLOMBIA_MS);
}

/** Partes de calendario en hora Colombia. */
export function partesColombia(instante: Date): { fecha: string; diaSemana: number; minutosDelDia: number } {
  const local = new Date(instante.getTime() - OFFSET_COLOMBIA_MS);
  const fecha = local.toISOString().slice(0, 10);
  return {
    fecha,
    diaSemana: local.getUTCDay(),
    minutosDelDia: local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60,
  };
}

export function intervaloTurno(fecha: string, horaInicio: string, horaFin: string): { inicio: Date; fin: Date } {
  const inicio = instanteColombia(fecha, horaInicio);
  let fin = instanteColombia(fecha, horaFin);
  if (fin.getTime() <= inicio.getTime()) fin = new Date(fin.getTime() + 24 * 3600 * 1000);
  return { inicio, fin };
}

/** Lunes (hora Colombia) de la semana de `fecha`. */
export function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}
