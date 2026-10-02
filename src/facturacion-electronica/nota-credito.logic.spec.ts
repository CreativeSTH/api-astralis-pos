import { armarNotaCredito } from './nota-credito.logic';

const devolucion = {
  total: 31_306.53,
  items: [
    { nombreProducto: 'Martillo', cantidad: 1, precioUnitario: 10_000, base: 9_333.33, impuesto: 1_773.33, descuentoVenta: 687.82, total: 10_418.84 },
    { nombreProducto: 'Taladro', cantidad: 1, precioUnitario: 20_000, base: 20_000, impuesto: 3_800, descuentoVenta: 2_912.31, total: 20_887.69 },
  ],
  reembolsos: [{ forma: 'EFECTIVO' as const, monto: 31_306.53 }],
};
const factura = { prefijo: 'SETP', numero: 990000123, fechaEmision: new Date('2026-10-01T15:00:00Z'), cufe: 'cufe-abc' };

describe('armarNotaCredito', () => {
  const nc = armarNotaCredito({ devolucion, factura });

  it('documento asociado = la factura (tipo 01) con su CUFE y fecha Colombia', () => {
    expect(nc.documentoAsociado).toEqual({ prefix: 'SETP', number: 990000123, documentType: '01', date: '2026-10-01', uuid: 'cufe-abc' });
  });

  it('items con base, IVA y % como la factura', () => {
    expect(nc.items[1]).toMatchObject({
      description: 'Taladro',
      quantity: 1,
      price: 20_000,
      unitCode: '94',
      code: '999',
      subtotal: 20_000,
      taxAmount: 3_800,
      total: 23_800,
      taxes: [{ taxCode: '01', taxAmount: 3_800, taxPercentage: '19.00', taxableAmount: 20_000 }],
    });
  });

  it('totales cuadran: bruto − descuento + IVA = total devuelto', () => {
    const t = nc.totalAmounts;
    expect(t.grossTotal).toBe(30_000);
    expect(t.grossTotal - t.discountTotal + t.taxTotal).toBeCloseTo(t.payableTotal, 2);
    expect(t.payableTotal).toBe(devolucion.total);
  });

  it('pagos: efectivo = medio 10, el resto = 1 (instrumento no definido), sin repetir', () => {
    const conVarios = armarNotaCredito({
      devolucion: {
        ...devolucion,
        reembolsos: [
          { forma: 'DESCUENTO_DEUDA', monto: 1 },
          { forma: 'SALDO_A_FAVOR', monto: 1 },
          { forma: 'EFECTIVO', monto: 1 },
        ],
      },
      factura,
    });
    expect(conVarios.payments.map((p) => p.paymentMethod).sort()).toEqual(['1', '10']);
    expect(conVarios.payments.every((p) => p.paymentForm === '1')).toBe(true);
  });
});
