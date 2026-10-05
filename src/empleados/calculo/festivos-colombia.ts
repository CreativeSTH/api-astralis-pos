/**
 * Festivos de Colombia (Ley 51 de 1983, "Ley Emiliani"): 6 fijos, 7 que se trasladan al lunes siguiente
 * y 5 que dependen de la Pascua. El frontend tiene una copia en `shared/utils/festivos-colombia.ts`.
 */
const cache = new Map<number, Set<string>>();

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const masDias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
/** El mismo día si es lunes; si no, el lunes siguiente. */
const alLunes = (d: Date) => {
  const dow = d.getUTCDay();
  return dow === 1 ? d : masDias(d, (8 - dow) % 7);
};

/** Algoritmo anónimo gregoriano (Meeus/Jones/Butcher). */
export function domingoDePascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(utc(anio, mes, dia));
}

export function festivosDelAnio(anio: number): Set<string> {
  const enCache = cache.get(anio);
  if (enCache) return enCache;
  const pascua = new Date(`${domingoDePascua(anio)}T00:00:00Z`);
  const fijos = [utc(anio, 1, 1), utc(anio, 5, 1), utc(anio, 7, 20), utc(anio, 8, 7), utc(anio, 12, 8), utc(anio, 12, 25)];
  const trasladables = [
    utc(anio, 1, 6), // Reyes
    utc(anio, 3, 19), // San José
    utc(anio, 6, 29), // San Pedro y San Pablo
    utc(anio, 8, 15), // Asunción
    utc(anio, 10, 12), // Día de la Raza
    utc(anio, 11, 1), // Todos los Santos
    utc(anio, 11, 11), // Independencia de Cartagena
  ].map(alLunes);
  // Jueves y Viernes Santo; Ascensión (+43), Corpus Christi (+64) y Sagrado Corazón (+71), ya en lunes.
  const pascuales = [masDias(pascua, -3), masDias(pascua, -2), masDias(pascua, 43), masDias(pascua, 64), masDias(pascua, 71)];
  const festivos = new Set([...fijos, ...trasladables, ...pascuales].map(iso));
  cache.set(anio, festivos);
  return festivos;
}

/** 'YYYY-MM-DD' en hora Colombia. */
export function esDominicalOFestivo(fecha: string): boolean {
  const d = new Date(`${fecha}T12:00:00Z`);
  return d.getUTCDay() === 0 || festivosDelAnio(d.getUTCFullYear()).has(fecha);
}
