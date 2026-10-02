/**
 * Medio de pago reservado (spec de devoluciones 3.4): no es una fila de `metodos_pago`, no entra a
 * la caja (no se cuenta en el arqueo) y descuenta `Cliente.saldoAFavor` dentro de la transacción de
 * la venta. En la factura electrónica cae en el medio DIAN "1" (instrumento no definido).
 */
export const METODO_SALDO_A_FAVOR = 'Saldo a favor';

export const esSaldoAFavor = (metodo: string) =>
  metodo.trim().toLowerCase() === METODO_SALDO_A_FAVOR.toLowerCase();

export function montoSaldoAFavor(pagos: { metodoPago: string; monto: number }[]): number {
  const total = pagos.filter((p) => esSaldoAFavor(p.metodoPago)).reduce((s, p) => s + Number(p.monto), 0);
  return Math.round(total * 100) / 100;
}
