/**
 * Valor de la UVT por año, en pesos. Se actualiza cada diciembre con la resolución de la DIAN.
 * Año sin valor → el tope de ese año no se evalúa (el cron loguea un warning y nunca marca a un
 * negocio como obligado por un dato faltante).
 */
export const UVT_POR_ANIO: Readonly<Record<number, number>> = {
  2025: 49_799, // Res. DIAN 000193 de 2024
  2026: 52_374, // Res. DIAN 000238 de 2025
};

/** Ingresos brutos a partir de los cuales una persona natural no responsable de IVA queda obligada a facturar (art. 437 par. 3 ET). */
export const TOPE_UVT = 3_500;

export function topeEnPesos(anio: number): number | null {
  const uvt = UVT_POR_ANIO[anio];
  return uvt === undefined ? null : uvt * TOPE_UVT;
}
