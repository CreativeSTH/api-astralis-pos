/** Solo queda para el campo `tipoComprobante` del DTO de venta, que se ignora por compatibilidad (fase 1). */
export enum TipoComprobante {
  RECIBO = 'RECIBO',
  FACTURA = 'FACTURA',
}

/**
 * Comprobante que quedó asociado a una venta.
 * `FACTURA` (factura convencional) solo existe en ventas históricas — nunca se asigna a una nueva.
 */
export enum TipoComprobanteVenta {
  RECIBO = 'RECIBO',
  FACTURA = 'FACTURA',
  FACTURA_ELECTRONICA = 'FACTURA_ELECTRONICA',
}

/**
 * Secuencias de `NumeracionComprobante`: recibos de venta, recibos de caja (abonos a crédito) y el
 * rango de la factura convencional histórica.
 */
export enum TipoNumeracion {
  RECIBO = 'RECIBO',
  FACTURA = 'FACTURA',
  RECIBO_CAJA = 'RECIBO_CAJA',
}
