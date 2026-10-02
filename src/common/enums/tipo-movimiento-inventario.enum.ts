export enum TipoMovimientoInventario {
  ENTRADA = 'ENTRADA',
  SALIDA = 'SALIDA',
  AJUSTE = 'AJUSTE',
  VENTA = 'VENTA',
  DEVOLUCION = 'DEVOLUCION',
  /** Producto devuelto que NO vuelve al inventario (dañado/vencido): informativo, no cambia existencias. */
  BAJA_DEVOLUCION = 'BAJA_DEVOLUCION',
}
