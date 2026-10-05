export enum TipoMovimientoInventario {
  ENTRADA = 'ENTRADA',
  SALIDA = 'SALIDA',
  AJUSTE = 'AJUSTE',
  VENTA = 'VENTA',
  DEVOLUCION = 'DEVOLUCION',
  /** Producto devuelto que NO vuelve al inventario (dañado/vencido): informativo, no cambia existencias. */
  BAJA_DEVOLUCION = 'BAJA_DEVOLUCION',
  /** Sale del origen al enviar un traslado (spec 2026-10-04). */
  TRASLADO_SALIDA = 'TRASLADO_SALIDA',
  /** Entra al destino al recibir. */
  TRASLADO_ENTRADA = 'TRASLADO_ENTRADA',
  /** Vuelve al origen porque el traslado se canceló (suma, como TRASLADO_ENTRADA). */
  TRASLADO_CANCELADO = 'TRASLADO_CANCELADO',
  /** Lo que no llegó al recibir: informativo, no cambia existencias (como BAJA_DEVOLUCION). */
  FALTANTE_TRASLADO = 'FALTANTE_TRASLADO',
}
