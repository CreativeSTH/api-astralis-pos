import { Cuota } from './entities/cuota.entity';

/** Diferencia (en pesos) que se tolera por redondeo al comparar pagos contra totales. */
export const TOLERANCIA_REDONDEO = 1;

export interface ResultadoAbono {
  moraPagada: number;
  capitalPagado: number;
  /** Capital pendiente de toda la venta (Σ saldoPendiente de sus cuotas), antes y después del abono. */
  saldoVentaAnterior: number;
  saldoVentaNuevo: number;
}

const redondear = (valor: number) => Math.round(valor * 100) / 100;
const saldoDe = (cuotas: Cuota[]) =>
  redondear(cuotas.reduce((suma, c) => suma + Number(c.saldoPendiente), 0));

/**
 * Aplica un abono a una cuota (la muta): si `incluirMora`, primero cubre la mora y el resto va a
 * capital, sin pasarse del saldo. Devuelve lo necesario para el recibo de caja.
 */
export function aplicarAbono(
  cuota: Cuota,
  cuotasVenta: Cuota[],
  montoAbono: number,
  incluirMora: boolean,
  ahora: Date = new Date(),
): ResultadoAbono {
  const saldoVentaAnterior = saldoDe(cuotasVenta);
  const saldoCuotaAntes = Number(cuota.saldoPendiente);

  let restante = montoAbono;
  let moraPagada = 0;
  if (incluirMora && Number(cuota.montoMora) > 0) {
    moraPagada = Math.min(restante, Number(cuota.montoMora));
    cuota.montoMora = Number(cuota.montoMora) - moraPagada;
    restante -= moraPagada;
  }

  const capitalPagado = Math.min(restante, saldoCuotaAntes);
  cuota.montoPagado = Number(cuota.montoPagado) + capitalPagado;
  cuota.saldoPendiente = saldoCuotaAntes - capitalPagado;
  cuota.montoTotalConMora =
    Number(cuota.saldoPendiente) + Number(cuota.montoMora);

  if (cuota.saldoPendiente <= TOLERANCIA_REDONDEO) {
    cuota.pagada = true;
    cuota.saldoPendiente = 0;
    cuota.fechaPago = ahora;
  }

  // Por diferencia de la cuota (no volviendo a sumar): funciona aunque `cuota` no sea la misma instancia del arreglo.
  const saldoVentaNuevo = redondear(
    saldoVentaAnterior - (saldoCuotaAntes - Number(cuota.saldoPendiente)),
  );
  return { moraPagada, capitalPagado, saldoVentaAnterior, saldoVentaNuevo };
}
