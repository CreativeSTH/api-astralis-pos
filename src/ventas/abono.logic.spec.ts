import { aplicarAbono } from './abono.logic';
import { Cuota } from './entities/cuota.entity';

const cuota = (over: Partial<Cuota> = {}): Cuota =>
  ({
    numero: 1,
    monto: 100_000,
    montoPagado: 0,
    saldoPendiente: 100_000,
    pagada: false,
    montoMora: 0,
    montoTotalConMora: 100_000,
    ...over,
  }) as Cuota;

describe('aplicarAbono', () => {
  it('abono parcial sin mora: baja el saldo de la cuota y el de la venta', () => {
    const c1 = cuota();
    const c2 = cuota({ numero: 2 });
    const r = aplicarAbono(c1, [c1, c2], 40_000, true);
    expect(r).toEqual({
      moraPagada: 0,
      capitalPagado: 40_000,
      saldoVentaAnterior: 200_000,
      saldoVentaNuevo: 160_000,
    });
    expect(c1).toMatchObject({
      montoPagado: 40_000,
      saldoPendiente: 60_000,
      montoTotalConMora: 60_000,
      pagada: false,
    });
  });

  it('con mora e incluirMora: primero la mora, después el capital', () => {
    const c1 = cuota({ montoMora: 5_000, montoTotalConMora: 105_000 });
    const r = aplicarAbono(c1, [c1], 30_000, true);
    expect(r).toMatchObject({
      moraPagada: 5_000,
      capitalPagado: 25_000,
      saldoVentaNuevo: 75_000,
    });
    expect(c1.montoMora).toBe(0);
  });

  it('sin incluirMora: todo va a capital y la mora queda', () => {
    const c1 = cuota({ montoMora: 5_000 });
    const r = aplicarAbono(c1, [c1], 30_000, false);
    expect(r).toMatchObject({ moraPagada: 0, capitalPagado: 30_000 });
    expect(c1).toMatchObject({ montoMora: 5_000, montoTotalConMora: 75_000 });
  });

  it('pago completo (con $1 de tolerancia): marca la cuota pagada con la fecha dada', () => {
    const ahora = new Date('2026-09-29T15:00:00Z');
    const c1 = cuota();
    const r = aplicarAbono(c1, [c1], 99_999.5, true, ahora);
    expect(c1).toMatchObject({
      pagada: true,
      saldoPendiente: 0,
      fechaPago: ahora,
    });
    expect(r.saldoVentaNuevo).toBe(0);
  });

  it('el abono de más no reduce el capital por debajo de cero', () => {
    const c1 = cuota({ saldoPendiente: 10_000, montoTotalConMora: 10_000 });
    const r = aplicarAbono(c1, [c1], 50_000, true);
    expect(r.capitalPagado).toBe(10_000);
    expect(c1.saldoPendiente).toBe(0);
  });

  it('acepta numeric de Postgres como string', () => {
    const c1 = cuota({
      saldoPendiente: '100000.00' as unknown as number,
      montoPagado: '0.00' as unknown as number,
    });
    const r = aplicarAbono(c1, [c1], 1_000, true);
    expect(r).toMatchObject({
      saldoVentaAnterior: 100_000,
      saldoVentaNuevo: 99_000,
    });
  });
});
