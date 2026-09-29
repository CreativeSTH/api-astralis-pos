export enum TipoComprobante {
  RECIBO = 'RECIBO',
  FACTURA = 'FACTURA',
}

/**
 * Comprobante que quedó asociado a una venta. Enum propio (no `TipoComprobante`) para que
 * `FACTURA_ELECTRONICA` no aparezca en plantillas/numeraciones/sucursales, que comparten el otro.
 * `FACTURA` (factura convencional) solo existe en ventas históricas — nunca se asigna a una nueva.
 */
export enum TipoComprobanteVenta {
  RECIBO = 'RECIBO',
  FACTURA = 'FACTURA',
  FACTURA_ELECTRONICA = 'FACTURA_ELECTRONICA',
}

/**
 * Secuencias de `NumeracionComprobante`. Enum propio (no `TipoComprobante`) para que
 * `RECIBO_CAJA` — el soporte de cada abono a crédito — no aparezca como tipo de plantilla ni
 * como comprobante por defecto de la sucursal.
 */
export enum TipoNumeracion {
  RECIBO = 'RECIBO',
  FACTURA = 'FACTURA',
  RECIBO_CAJA = 'RECIBO_CAJA',
}
