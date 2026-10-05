/**
 * Parámetros legales del cálculo de horas extra y recargos (spec 2026-10-04 turnos §2, con fuentes).
 * NUNCA editar un valor viejo: si cambia la ley, agregar una entrada con su fecha `desde`, para que un
 * período anterior se siga calculando con la regla de su fecha.
 */
export interface Vigencia<T> {
  /** 'YYYY-MM-DD' */
  desde: string;
  valor: T;
}

/** Valor de la última entrada con `desde <= fecha` (la serie va ordenada por `desde`). */
export function valorVigente<T>(serie: Vigencia<T>[], fecha: string): T {
  let actual = serie[0].valor;
  for (const v of serie) if (v.desde <= fecha) actual = v.valor;
  return actual;
}

/** Minutos desde medianoche en que empieza la franja nocturna (termina a las 06:00). Ley 2466 de 2025, art. 10. */
export const INICIO_NOCTURNO: Vigencia<number>[] = [
  { desde: '1900-01-01', valor: 21 * 60 },
  { desde: '2025-12-25', valor: 19 * 60 },
];
export const FIN_NOCTURNO_MIN = 6 * 60;

/** Recargo por trabajo dominical o festivo. Ley 2466 de 2025, art. 14. */
export const RECARGO_DOMINICAL: Vigencia<number>[] = [
  { desde: '1900-01-01', valor: 0.75 },
  { desde: '2025-07-01', valor: 0.8 },
  { desde: '2026-07-01', valor: 0.9 },
  { desde: '2027-07-01', valor: 1 },
];

/** Jornada máxima semanal en horas. Ley 2101 de 2021, art. 3. */
export const JORNADA_SEMANAL: Vigencia<number>[] = [
  { desde: '1900-01-01', valor: 48 },
  { desde: '2023-07-15', valor: 47 },
  { desde: '2024-07-15', valor: 46 },
  { desde: '2025-07-15', valor: 44 },
  { desde: '2026-07-15', valor: 42 },
];

/** CST art. 168. */
export const RECARGO_NOCTURNO = 0.35;
export const EXTRA_DIURNA = 0.25;
export const EXTRA_NOCTURNA = 0.75;

/** CST art. 162: máximo 2 h extra diarias y 12 semanales (aquí solo generan alertas). */
export const MAX_EXTRA_DIA_MIN = 120;
export const MAX_EXTRA_SEMANA_MIN = 720;

/** Concepto Mintrabajo 16177/2023: horas del mes = jornada semanal ÷ 6 × 30 (42 h → 210). */
export function divisorHora(fecha: string): number {
  return (valorVigente(JORNADA_SEMANAL, fecha) / 6) * 30;
}
