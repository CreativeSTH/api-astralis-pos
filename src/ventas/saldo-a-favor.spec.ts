import { esSaldoAFavor, METODO_SALDO_A_FAVOR, montoSaldoAFavor } from './saldo-a-favor';

describe('saldo a favor', () => {
  it('suma solo los pagos con el medio reservado', () => {
    expect(
      montoSaldoAFavor([
        { metodoPago: METODO_SALDO_A_FAVOR, monto: 10_000 },
        { metodoPago: 'Efectivo', monto: 5_000 },
      ]),
    ).toBe(10_000);
  });

  it('compara sin importar mayúsculas ni espacios', () => {
    expect(montoSaldoAFavor([{ metodoPago: ' saldo a FAVOR ', monto: 1 }])).toBe(1);
    expect(esSaldoAFavor('Saldo  a favor')).toBe(false);
  });

  it('sin pagos con saldo da 0', () => {
    expect(montoSaldoAFavor([{ metodoPago: 'Nequi', monto: 3 }])).toBe(0);
  });
});
