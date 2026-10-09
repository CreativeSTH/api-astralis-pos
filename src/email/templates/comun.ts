import { Bloque, parrafo } from '../diseno/bloques';
import { fechaLarga, pesos } from '../diseno/formato';
import { CicloFacturacion } from '../../suscripciones/entities/ciclo-facturacion.enum';

export function saludo(nombre?: string | null): Bloque {
  const limpio = nombre?.trim();
  return parrafo(limpio ? `Hola, ${limpio}.` : 'Hola.');
}

export function motivoAdmin(nombreNegocio?: string | null): string {
  const limpio = nombreNegocio?.trim();
  return limpio
    ? `Recibes este correo porque administras ${limpio} en AURA.`
    : 'Recibes este correo porque administras un negocio en AURA.';
}

/** Datos de la suscripción que muestran los recordatorios (spec 2026-10-08 §5.2–5.3). */
export interface DatosPlanCorreo {
  nombre?: string | null;
  nombreNegocio?: string | null;
  plan: string;
  ciclo: CicloFacturacion;
  /** En pesos (no centavos). 0 = no se muestra. */
  valor: number;
  fechaFin: Date;
  enPrueba: boolean;
  tieneTarjeta: boolean;
  ultimosCuatro?: string | null;
  linkMiPlan: string;
}

export function filasPlan(d: DatosPlanCorreo, etiquetaFecha: string): [string, string | null][] {
  return [
    ['Plan', d.plan],
    ['Ciclo', d.ciclo === CicloFacturacion.ANUAL ? 'Anual' : 'Mensual'],
    ['Valor', d.valor > 0 ? pesos(d.valor) : null],
    [etiquetaFecha, fechaLarga(d.fechaFin)],
    ['Tarjeta', d.ultimosCuatro ? `•••• ${d.ultimosCuatro}` : null],
  ];
}
