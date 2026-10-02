import type {
  DocumentoAsociadoAlegra,
  ItemFacturaAlegra,
  PaymentAlegra,
  TotalAmountsFacturaAlegra,
} from './alegra-client.service';
import { diaColombia } from '../common/utils/fecha-colombia';
import type { FormaReembolso } from '../devoluciones/devolucion.logic';

/** Las notas crédito no llevan resolución DIAN: consecutivo propio por negocio con este prefijo. */
export const PREFIJO_NOTA_CREDITO = 'NC';

const r2 = (v: number) => Math.round(v * 100) / 100;

interface ItemDevuelto {
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  base: number;
  impuesto: number;
  descuentoVenta: number;
  total: number;
}

/**
 * Misma forma que la factura (`mapearItemsAlegra`/`mapearTotalesAlegra`): items con su base e IVA,
 * y el descuento de venta (manual + cupón) dentro de `discountTotal` — así la nota cuadra con la factura.
 */
export function armarNotaCredito(p: {
  devolucion: { items: ItemDevuelto[]; reembolsos: { forma: FormaReembolso; monto: number }[]; total: number };
  factura: { prefijo: string; numero: number; fechaEmision: Date; cufe: string };
}): {
  items: ItemFacturaAlegra[];
  totalAmounts: TotalAmountsFacturaAlegra;
  payments: PaymentAlegra[];
  documentoAsociado: DocumentoAsociadoAlegra;
} {
  const items = p.devolucion.items.map((i): ItemFacturaAlegra => {
    const base = Number(i.base);
    const impuesto = Number(i.impuesto);
    const pct = base > 0 ? (impuesto / base) * 100 : 0;
    return {
      description: i.nombreProducto,
      quantity: Number(i.cantidad),
      price: Number(i.precioUnitario),
      // Mismos códigos que la factura: "94" unidad y "999" estándar de adopción del contribuyente.
      unitCode: '94',
      code: '999',
      subtotal: base,
      total: r2(base + impuesto),
      taxAmount: impuesto,
      taxes: [{ taxCode: '01', taxAmount: impuesto, taxPercentage: pct.toFixed(2), taxableAmount: base }],
    };
  });
  const bruto = r2(p.devolucion.items.reduce((s, i) => s + Number(i.precioUnitario) * Number(i.cantidad), 0));
  const bases = r2(p.devolucion.items.reduce((s, i) => s + Number(i.base), 0));
  const impuestos = r2(p.devolucion.items.reduce((s, i) => s + Number(i.impuesto), 0));
  const descuentoVenta = r2(p.devolucion.items.reduce((s, i) => s + Number(i.descuentoVenta), 0));
  const discountTotal = r2(bruto - bases + descuentoVenta);
  const hoy = diaColombia();
  // Catálogo DIAN de medios: 10 efectivo; deuda y saldo a favor no mueven un instrumento → 1 (no definido).
  const medios = [...new Set(p.devolucion.reembolsos.map((r) => (r.forma === 'EFECTIVO' ? '10' : '1')))];
  return {
    items,
    totalAmounts: {
      grossTotal: bruto,
      taxableTotal: r2(bruto - discountTotal),
      taxTotal: impuestos,
      payableTotal: Number(p.devolucion.total),
      discountTotal,
      chargeTotal: 0,
      advanceTotal: 0,
    },
    payments: medios.map((paymentMethod) => ({ paymentForm: '1', paymentMethod, paymentDueDate: hoy })),
    documentoAsociado: {
      prefix: p.factura.prefijo,
      number: p.factura.numero,
      documentType: '01',
      date: diaColombia(new Date(p.factura.fechaEmision)),
      uuid: p.factura.cufe,
    },
  };
}
