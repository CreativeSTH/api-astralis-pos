/** Pesos oficiales DIAN (Resolución 2007) para el cálculo del dígito de verificación, de derecha a izquierda. */
const PESOS_DV = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Deja solo dígitos — quita guiones, puntos y espacios de un NIT como "900.123.456-7". */
export function limpiarNit(nit: string): string {
  return nit.replace(/\D/g, '');
}

/**
 * Dígito de verificación DIAN de un NIT, algoritmo oficial (módulo 11 con pesos
 * fijos por posición). Verificado contra el NIT público de la propia DIAN
 * (899999034 → dv 1) — ver nit.spec.ts.
 */
export function calcularDigitoVerificacion(nit: string): string {
  const digitos = limpiarNit(nit);
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    const digito = Number(digitos[digitos.length - 1 - i]);
    const peso = PESOS_DV[i] ?? 0;
    suma += digito * peso;
  }
  const resto = suma % 11;
  return String(resto > 1 ? 11 - resto : resto);
}
