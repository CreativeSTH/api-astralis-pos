import { BadRequestException } from '@nestjs/common';
import {
  ajustarReembolsos,
  bloqueoPorFactura,
  calcularLineaDevuelta,
  conceptoNotaCredito,
  ItemVendido,
  netosPorLinea,
  repartirEnCuotas,
  validarSolicitud,
} from './devolucion.logic';

// Venta de referencia: 2 líneas con IVA 19 %, descuento de línea en la 1 y un cupón de 5.000.
// subtotal (bruto) 70.000, descuento líneas 2.000, impuesto 12.920, cupón 5.000 → total 75.920.
const items: ItemVendido[] = [
  { id: 'a', cantidad: 3, precioUnitario: 10_000, descuento: 2_000, baseImponible: 28_000, impuesto: 5_320, subtotal: 33_320 },
  { id: 'b', cantidad: 2, precioUnitario: 20_000, descuento: 0, baseImponible: 40_000, impuesto: 7_600, subtotal: 47_600 },
];
const DESCUENTO_TOTAL_VENTA = 7_000; // 2.000 de línea + 5.000 de cupón
const TOTAL_VENTA = 75_920;

describe('netosPorLinea', () => {
  it('reparte el descuento de venta por peso de cada línea y suma exactamente el total', () => {
    const netos = netosPorLinea(items, DESCUENTO_TOTAL_VENTA);
    const a = netos.get('a')!;
    const b = netos.get('b')!;
    expect(a.descuentoVenta).toBeCloseTo(2_058.82, 2); // 5.000 × 33.320 / 80.920
    expect(a.descuentoVenta + b.descuentoVenta).toBeCloseTo(5_000, 2);
    expect(a.neto + b.neto).toBeCloseTo(TOTAL_VENTA, 2);
  });

  it('sin descuento de venta el neto es el subtotal de la línea', () => {
    const netos = netosPorLinea(items, 2_000);
    expect(netos.get('a')!.neto).toBe(33_320);
    expect(netos.get('b')!.neto).toBe(47_600);
  });
});

describe('calcularLineaDevuelta', () => {
  const netos = netosPorLinea(items, DESCUENTO_TOTAL_VENTA);
  const a = { item: items[0], netoLinea: netos.get('a')!.neto, descuentoVentaLinea: netos.get('a')!.descuentoVenta };

  it('tres devoluciones de 1 unidad suman exactamente el neto de la línea (redondeo acumulado)', () => {
    const r1 = calcularLineaDevuelta({ ...a, devueltaPrevia: 0, cantidad: 1 });
    const r2 = calcularLineaDevuelta({ ...a, devueltaPrevia: 1, cantidad: 1 });
    const r3 = calcularLineaDevuelta({ ...a, devueltaPrevia: 2, cantidad: 1 });
    expect(r1.total + r2.total + r3.total).toBeCloseTo(a.netoLinea, 2);
    expect(r1.base + r2.base + r3.base).toBeCloseTo(28_000, 2);
    expect(r1.impuesto + r2.impuesto + r3.impuesto).toBeCloseTo(5_320, 2);
  });

  it('total = base + impuesto − descuento de venta, y bruto = precio × cantidad', () => {
    const r = calcularLineaDevuelta({ ...a, devueltaPrevia: 0, cantidad: 2 });
    expect(r.total).toBeCloseTo(r.base + r.impuesto - r.descuentoVenta, 2);
    expect(r.bruto).toBe(20_000);
  });

  it('devolver toda la venta suma exactamente el total', () => {
    const b = { item: items[1], netoLinea: netos.get('b')!.neto, descuentoVentaLinea: netos.get('b')!.descuentoVenta };
    const total =
      calcularLineaDevuelta({ ...a, devueltaPrevia: 0, cantidad: 3 }).total +
      calcularLineaDevuelta({ ...b, devueltaPrevia: 0, cantidad: 2 }).total;
    expect(total).toBeCloseTo(TOTAL_VENTA, 2);
  });
});

describe('repartirEnCuotas', () => {
  const cuotas = [
    { id: 'c1', numero: 1, saldoPendiente: 0 },
    { id: 'c2', numero: 2, saldoPendiente: 30_000 },
    { id: 'c3', numero: 3, saldoPendiente: 40_000 },
  ];

  it('descuenta desde la última cuota hacia atrás', () => {
    expect(repartirEnCuotas(cuotas, 50_000)).toEqual([
      { cuotaId: 'c3', aplicado: 40_000 },
      { cuotaId: 'c2', aplicado: 10_000 },
    ]);
  });

  it('no aplica más del saldo total', () => {
    expect(() => repartirEnCuotas(cuotas, 70_001)).toThrow(BadRequestException);
  });

  it('tampoco un centavo de más', () => {
    expect(() => repartirEnCuotas(cuotas, 70_000.01)).toThrow(BadRequestException);
  });
});

describe('validarSolicitud', () => {
  const base = {
    lineas: new Map([['a', { disponible: 3 }]]),
    items: [{ ventaItemId: 'a', cantidad: 1 }],
    total: 10_000,
    reembolsos: [{ forma: 'EFECTIVO' as const, monto: 10_000 }],
    saldoDeudaVenta: 0,
    tieneCliente: false,
    efectivoDisponible: 50_000 as number | null,
  };

  it('acepta una solicitud correcta', () => {
    expect(() => validarSolicitud(base)).not.toThrow();
  });

  it.each([
    ['cantidad mayor a la disponible', { items: [{ ventaItemId: 'a', cantidad: 4 }] }, 'Solo quedan 3'],
    ['línea que no es de la venta', { items: [{ ventaItemId: 'z', cantidad: 1 }] }, 'no pertenece'],
    ['cantidad cero', { items: [{ ventaItemId: 'a', cantidad: 0 }] }, 'mayor que cero'],
    ['línea repetida', { items: [{ ventaItemId: 'a', cantidad: 1 }, { ventaItemId: 'a', cantidad: 1 }] }, 'repetido'],
    ['reembolso que no suma el total', { reembolsos: [{ forma: 'EFECTIVO' as const, monto: 9_000 }] }, 'deben sumar'],
    ['descuento de deuda sin deuda', { reembolsos: [{ forma: 'DESCUENTO_DEUDA' as const, monto: 10_000 }] }, 'saldo pendiente'],
    [
      'descuento de deuda un centavo mayor al saldo (hallazgo en vivo 2026-10-02)',
      { saldoDeudaVenta: 9_999.99, reembolsos: [{ forma: 'DESCUENTO_DEUDA' as const, monto: 10_000 }] },
      'saldo pendiente',
    ],
    ['saldo a favor sin cliente', { reembolsos: [{ forma: 'SALDO_A_FAVOR' as const, monto: 10_000 }] }, 'cliente'],
    ['efectivo sin turno', { efectivoDisponible: null }, 'turno de caja abierto'],
    ['efectivo mayor a lo que hay', { efectivoDisponible: 5_000 }, 'no alcanza'],
    [
      'forma repetida',
      { reembolsos: [{ forma: 'EFECTIVO' as const, monto: 5_000 }, { forma: 'EFECTIVO' as const, monto: 5_000 }] },
      'repetida',
    ],
  ])('rechaza %s', (_caso, cambio, mensaje) => {
    expect(() => validarSolicitud({ ...base, ...cambio })).toThrow(mensaje);
  });
});

describe('bloqueoPorFactura', () => {
  it('sin factura electrónica no bloquea', () => expect(bloqueoPorFactura(null)).toBeNull());
  it('factura aceptada no bloquea', () => {
    expect(bloqueoPorFactura({ estado: 'ACEPTADO', periodoContingenciaId: null })).toBeNull();
    expect(bloqueoPorFactura({ estado: 'ACEPTADO_CON_OBSERVACIONES', periodoContingenciaId: null })).toBeNull();
  });
  it.each(['PENDIENTE', 'RECHAZADO', 'ERROR'])('factura %s bloquea', (estado) => {
    expect(bloqueoPorFactura({ estado, periodoContingenciaId: null })).toMatch(/DIAN/);
  });
  it('contingencia sin transmitir bloquea con su propio mensaje', () => {
    expect(bloqueoPorFactura({ estado: 'PENDIENTE', periodoContingenciaId: 'p1' })).toMatch(/contingencia/);
  });
});

describe('conceptoNotaCredito', () => {
  it('anulación solo si es la primera devolución y deja la venta en total', () => {
    expect(conceptoNotaCredito({ quedaTotal: true, esPrimeraDevolucion: true })).toBe('2');
    expect(conceptoNotaCredito({ quedaTotal: true, esPrimeraDevolucion: false })).toBe('1');
    expect(conceptoNotaCredito({ quedaTotal: false, esPrimeraDevolucion: true })).toBe('1');
  });
});

describe('ajustarReembolsos', () => {
  it('si ya suman el total los deja igual', () => {
    const r = [{ forma: 'EFECTIVO' as const, monto: 10_000 }];
    expect(ajustarReembolsos(r, 10_000, 0)).toEqual(r);
  });

  it('una diferencia de redondeo se lleva al efectivo para que sumen exacto', () => {
    expect(
      ajustarReembolsos(
        [
          { forma: 'DESCUENTO_DEUDA', monto: 5_000 },
          { forma: 'EFECTIVO', monto: 5_000.4 },
        ],
        10_000.01,
        5_000,
      ),
    ).toEqual([
      { forma: 'DESCUENTO_DEUDA', monto: 5_000 },
      { forma: 'EFECTIVO', monto: 5_000.01 },
    ]);
  });

  it('sin efectivo, la diferencia va al saldo a favor; nunca sube el descuento de deuda por encima del saldo', () => {
    expect(
      ajustarReembolsos(
        [
          { forma: 'DESCUENTO_DEUDA', monto: 32_130 },
          { forma: 'SALDO_A_FAVOR', monto: 0.5 },
        ],
        32_130.01,
        32_130,
      ),
    ).toEqual([
      { forma: 'DESCUENTO_DEUDA', monto: 32_130 },
      { forma: 'SALDO_A_FAVOR', monto: 0.01 },
    ]);
  });

  it('solo descuento de deuda: se ajusta hacia abajo pero nunca por encima del saldo', () => {
    expect(ajustarReembolsos([{ forma: 'DESCUENTO_DEUDA', monto: 32_130.4 }], 32_130, 40_000)).toEqual([
      { forma: 'DESCUENTO_DEUDA', monto: 32_130 },
    ]);
    expect(() => ajustarReembolsos([{ forma: 'DESCUENTO_DEUDA', monto: 32_129.6 }], 32_130, 32_129.6)).toThrow('saldo pendiente');
  });
});
