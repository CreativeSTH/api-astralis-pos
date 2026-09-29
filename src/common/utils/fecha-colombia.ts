/**
 * Días calendario en hora de Colombia. Los negocios operan en America/Bogota (UTC-5) y los filtros
 * llegan como 'YYYY-MM-DD' — cortar el día en UTC hacía que una venta de las 8 p. m. contara como
 * del día siguiente (y "hoy" pasaba a ser mañana desde las 7 p. m.). Offset fijo a propósito:
 * Colombia no tiene horario de verano, así que no hace falta una base de zonas horarias y el
 * resultado no depende de la zona del proceso Node.
 */
const OFFSET_COLOMBIA = '-05:00';
const OFFSET_COLOMBIA_MS = -5 * 60 * 60 * 1000;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Solo la parte 'YYYY-MM-DD' — tolera que el caller mande un ISO completo. */
const soloFecha = (fecha: string) => fecha.slice(0, 10);

/** Instante (UTC) en que empieza el día `fecha` ('YYYY-MM-DD') en Colombia. */
export function inicioDiaColombia(fecha: string): Date {
  return new Date(`${soloFecha(fecha)}T00:00:00.000${OFFSET_COLOMBIA}`);
}

/** Instante (UTC) del último milisegundo del día `fecha` ('YYYY-MM-DD') en Colombia. */
export function finDiaColombia(fecha: string): Date {
  return new Date(`${soloFecha(fecha)}T23:59:59.999${OFFSET_COLOMBIA}`);
}

/** Día calendario ('YYYY-MM-DD') que era en Colombia en ese instante — para agrupar por día. Sin argumento: hoy. */
export function diaColombia(instante: Date = new Date()): string {
  return new Date(instante.getTime() + OFFSET_COLOMBIA_MS)
    .toISOString()
    .slice(0, 10);
}

/** Hora del reloj (0-23) en Colombia en ese instante. Sin argumento: ahora. */
export function horaColombia(instante: Date = new Date()): number {
  return new Date(instante.getTime() + OFFSET_COLOMBIA_MS).getUTCHours();
}

/** Suma (o resta, con `dias` negativo) días a una fecha calendario 'YYYY-MM-DD', sin horas de por medio. */
export function sumarDiasColombia(fecha: string, dias: number): string {
  const d = new Date(`${soloFecha(fecha)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Rango para filtros por fecha: de las 00:00 de `desde` a las 23:59:59.999 de `hasta`, en Colombia.
 * Sin `hasta` usa hoy; sin `desde` usa `diasPorDefecto` días antes de `hasta`.
 */
export function rangoDiasColombia(
  desde: string | undefined,
  hasta: string | undefined,
  diasPorDefecto = 30,
): { desde: Date; hasta: Date } {
  const diaHasta = hasta ? soloFecha(hasta) : diaColombia();
  const diaDesde = desde
    ? soloFecha(desde)
    : sumarDiasColombia(diaHasta, -diasPorDefecto);
  return {
    desde: inicioDiaColombia(diaDesde),
    hasta: finDiaColombia(diaHasta),
  };
}

/** Clave de agrupación de un instante según el calendario de Colombia: día, lunes de su semana, o mes. */
export function claveAgrupacionColombia(
  instante: Date,
  agrupacion: 'DIA' | 'SEMANA' | 'MES',
): string {
  const dia = diaColombia(instante);
  if (agrupacion === 'MES') return dia.slice(0, 7);
  if (agrupacion === 'SEMANA') {
    const diaSemana = new Date(`${dia}T00:00:00.000Z`).getUTCDay() || 7; // lunes=1 .. domingo=7
    return sumarDiasColombia(dia, 1 - diaSemana);
  }
  return dia;
}

/** Días calendario transcurridos en Colombia desde `fecha` ('YYYY-MM-DD') hasta hoy — negativo si es futura. */
export function diasDesdeFechaColombia(fecha: string): number {
  const hoy = Date.parse(`${diaColombia()}T00:00:00.000Z`);
  return Math.round(
    (hoy - Date.parse(`${soloFecha(fecha)}T00:00:00.000Z`)) / MS_POR_DIA,
  );
}
