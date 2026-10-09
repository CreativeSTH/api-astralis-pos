import { diaColombia } from '../../common/utils/fecha-colombia';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export const pesos = (valor: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);

/** '2026-11-07' o un instante → '7 de noviembre de 2026' (el instante se lee en hora Colombia). */
export function fechaLarga(fecha: string | Date): string {
  const dia = typeof fecha === 'string' ? fecha.slice(0, 10) : diaColombia(fecha);
  const [anio, mes, d] = dia.split('-').map(Number);
  return `${d} de ${MESES[mes - 1]} de ${anio}`;
}
