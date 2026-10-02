import { BadRequestException } from '@nestjs/common';
import { TOLERANCIA_REDONDEO } from '../ventas/abono.logic';

export type FormaReembolso = 'EFECTIVO' | 'DESCUENTO_DEUDA' | 'SALDO_A_FAVOR';

export const ETIQUETA_FORMA: Record<FormaReembolso, string> = {
  EFECTIVO: 'Efectivo',
  DESCUENTO_DEUDA: 'Descuento a la deuda',
  SALDO_A_FAVOR: 'Saldo a favor',
};

export interface ItemVendido {
  id: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  baseImponible: number;
  impuesto: number;
  /** base + impuesto de la línea (neto de su propio descuento). */
  subtotal: number;
}

export const redondear2 = (v: number) => Math.round(v * 100) / 100;
/** Margen para comparar montos en pesos con centavos sin errores de coma flotante. */
const CENTAVO = 0.009;

/**
 * Neto pagado por línea: el descuento de venta (manual + cupón) no baja la base de las líneas
 * (`total = subtotal − descuentoTotal + impuesto`), así que se prorratea por el peso de cada línea.
 * La última línea absorbe el centavo de redondeo para que Σ netos = total de la venta.
 */
export function netosPorLinea(
  items: ItemVendido[],
  descuentoTotalVenta: number,
): Map<string, { neto: number; descuentoVenta: number }> {
  const descuentoLineas = items.reduce((s, i) => s + Number(i.descuento), 0);
  const descuentoVenta = redondear2(Math.max(0, Number(descuentoTotalVenta) - descuentoLineas));
  const sumaSubtotales = items.reduce((s, i) => s + Number(i.subtotal), 0);
  const resultado = new Map<string, { neto: number; descuentoVenta: number }>();
  let asignado = 0;
  items.forEach((item, indice) => {
    const esUltima = indice === items.length - 1;
    const parte =
      sumaSubtotales > 0
        ? esUltima
          ? redondear2(descuentoVenta - asignado)
          : redondear2((descuentoVenta * Number(item.subtotal)) / sumaSubtotales)
        : 0;
    asignado = redondear2(asignado + parte);
    resultado.set(item.id, { neto: redondear2(Number(item.subtotal) - parte), descuentoVenta: parte });
  });
  return resultado;
}

/** Parte acumulada de `valor` hasta `hasta` unidades de `n` — redondear el acumulado evita que se pierdan centavos. */
const acumulado = (valor: number, hasta: number, n: number) => redondear2((valor * hasta) / n);
const tramo = (valor: number, previa: number, cantidad: number, n: number) =>
  redondear2(acumulado(valor, previa + cantidad, n) - acumulado(valor, previa, n));

export function calcularLineaDevuelta(p: {
  item: ItemVendido;
  netoLinea: number;
  descuentoVentaLinea: number;
  devueltaPrevia: number;
  cantidad: number;
}): { total: number; base: number; impuesto: number; descuentoVenta: number; bruto: number } {
  const n = Number(p.item.cantidad);
  const total = tramo(p.netoLinea, p.devueltaPrevia, p.cantidad, n);
  const base = tramo(Number(p.item.baseImponible), p.devueltaPrevia, p.cantidad, n);
  const impuesto = tramo(Number(p.item.impuesto), p.devueltaPrevia, p.cantidad, n);
  // Derivado (no prorrateado aparte) para que total = base + impuesto − descuentoVenta siempre cuadre.
  const descuentoVenta = redondear2(base + impuesto - total);
  const bruto = redondear2(Number(p.item.precioUnitario) * p.cantidad);
  return { total, base, impuesto, descuentoVenta, bruto };
}

export interface CuotaReparto {
  id: string;
  numero: number;
  saldoPendiente: number;
}

/** Descuenta lo devuelto de la deuda empezando por la última cuota (la más lejana). */
export function repartirEnCuotas(cuotas: CuotaReparto[], monto: number): { cuotaId: string; aplicado: number }[] {
  const saldoTotal = redondear2(cuotas.reduce((s, c) => s + Number(c.saldoPendiente), 0));
  if (monto - saldoTotal > CENTAVO) {
    throw new BadRequestException(`El descuento a la deuda (${monto}) supera el saldo pendiente de la venta (${saldoTotal})`);
  }
  let restante = redondear2(monto);
  const resultado: { cuotaId: string; aplicado: number }[] = [];
  for (const cuota of [...cuotas].sort((a, b) => b.numero - a.numero)) {
    if (restante <= 0) break;
    const aplicado = redondear2(Math.min(restante, Number(cuota.saldoPendiente)));
    if (aplicado <= 0) continue;
    resultado.push({ cuotaId: cuota.id, aplicado });
    restante = redondear2(restante - aplicado);
  }
  return resultado;
}

export interface SolicitudValidable {
  /** ventaItemId → cantidad que todavía se puede devolver. */
  lineas: Map<string, { disponible: number }>;
  items: { ventaItemId: string; cantidad: number }[];
  /** Total calculado de lo que se devuelve. */
  total: number;
  reembolsos: { forma: FormaReembolso; monto: number }[];
  saldoDeudaVenta: number;
  tieneCliente: boolean;
  /** Efectivo esperado del turno abierto de la sucursal; null = no hay turno abierto. */
  efectivoDisponible: number | null;
}

export function validarSolicitud(s: SolicitudValidable): void {
  if (s.items.length === 0) throw new BadRequestException('Elige al menos un producto para devolver');
  const vistos = new Set<string>();
  for (const item of s.items) {
    if (vistos.has(item.ventaItemId)) throw new BadRequestException('Hay un producto repetido en la devolución');
    vistos.add(item.ventaItemId);
    const linea = s.lineas.get(item.ventaItemId);
    if (!linea) throw new BadRequestException('Un producto de la devolución no pertenece a esta venta');
    if (!(item.cantidad > 0)) throw new BadRequestException('La cantidad a devolver debe ser mayor que cero');
    if (item.cantidad > linea.disponible) {
      throw new BadRequestException(`Solo quedan ${linea.disponible} unidades por devolver de un producto`);
    }
  }

  const formas = new Set<FormaReembolso>();
  for (const r of s.reembolsos) {
    if (formas.has(r.forma)) throw new BadRequestException('Hay una forma de reembolso repetida');
    formas.add(r.forma);
    if (!(r.monto > 0)) throw new BadRequestException('Cada forma de reembolso debe tener un monto mayor que cero');
  }
  const suma = redondear2(s.reembolsos.reduce((acc, r) => acc + r.monto, 0));
  if (Math.abs(suma - s.total) > TOLERANCIA_REDONDEO) {
    throw new BadRequestException(`Los reembolsos (${suma}) deben sumar el total devuelto (${s.total})`);
  }

  for (const r of s.reembolsos) {
    // Estricto (sin la tolerancia de $1 del total): un centavo de más dejaba la deuda negativa (en vivo 2026-10-02).
    if (r.forma === 'DESCUENTO_DEUDA' && r.monto - s.saldoDeudaVenta > CENTAVO) {
      throw new BadRequestException(
        s.saldoDeudaVenta > 0
          ? `Solo puedes descontar hasta el saldo pendiente de la venta (${s.saldoDeudaVenta})`
          : 'Esta venta no tiene saldo pendiente para descontar',
      );
    }
    if (r.forma === 'SALDO_A_FAVOR' && !s.tieneCliente) {
      throw new BadRequestException('El saldo a favor necesita un cliente identificado en la venta');
    }
    if (r.forma === 'EFECTIVO') {
      if (s.efectivoDisponible === null) {
        throw new BadRequestException('Para devolver en efectivo necesitas un turno de caja abierto en esta sucursal');
      }
      if (r.monto - s.efectivoDisponible > TOLERANCIA_REDONDEO) {
        throw new BadRequestException(`El efectivo de la caja (${s.efectivoDisponible}) no alcanza para esta devolución`);
      }
    }
  }
}

/**
 * El cajero ve un total estimado (neto por unidad × cantidad); el backend calcula el exacto con redondeo
 * acumulado. `validarSolicitud` acepta hasta $1 de diferencia y esto la absorbe para que los reembolsos
 * sumen exactamente el total: primero en el efectivo, luego en el saldo a favor y por último en el
 * descuento de deuda, que nunca puede pasar del saldo pendiente.
 */
export function ajustarReembolsos(
  reembolsos: { forma: FormaReembolso; monto: number }[],
  total: number,
  saldoDeudaVenta: number,
): { forma: FormaReembolso; monto: number }[] {
  const ajustados = reembolsos.map((r) => ({ forma: r.forma, monto: redondear2(r.monto) }));
  const diferencia = redondear2(total - ajustados.reduce((s, r) => s + r.monto, 0));
  if (diferencia === 0) return ajustados;
  const destino = (['EFECTIVO', 'SALDO_A_FAVOR', 'DESCUENTO_DEUDA'] as FormaReembolso[])
    .map((forma) => ajustados.find((r) => r.forma === forma))
    .find((r) => r !== undefined)!;
  destino.monto = redondear2(destino.monto + diferencia);
  if (destino.monto <= 0) throw new BadRequestException('Cada forma de reembolso debe tener un monto mayor que cero');
  if (destino.forma === 'DESCUENTO_DEUDA' && destino.monto - saldoDeudaVenta > CENTAVO) {
    throw new BadRequestException(`Solo puedes descontar hasta el saldo pendiente de la venta (${saldoDeudaVenta})`);
  }
  return ajustados;
}

/** La nota crédito necesita una factura que la DIAN ya conozca; mientras tanto, la devolución espera. */
export function bloqueoPorFactura(doc: { estado: string; periodoContingenciaId: string | null } | null): string | null {
  if (!doc) return null;
  if (doc.estado === 'ACEPTADO' || doc.estado === 'ACEPTADO_CON_OBSERVACIONES') return null;
  if (doc.periodoContingenciaId) {
    return 'Esta factura es de contingencia y aún no se transmite a la DIAN: haz la devolución cuando quede aceptada';
  }
  return 'Espera a que la DIAN acepte la factura de esta venta antes de hacer la devolución';
}

export function conceptoNotaCredito(p: { quedaTotal: boolean; esPrimeraDevolucion: boolean }): '1' | '2' {
  return p.quedaTotal && p.esPrimeraDevolucion ? '2' : '1';
}
