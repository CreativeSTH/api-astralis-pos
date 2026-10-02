export enum TipoVenta {
  CONTADO = 'CONTADO',
  CREDITO = 'CREDITO',
}

export enum EstadoVenta {
  ACTIVA = 'ACTIVA',
  PARCIALMENTE_PAGADA = 'PARCIALMENTE_PAGADA',
  COMPLETADA = 'COMPLETADA',
  VENCIDA = 'VENCIDA',
  EN_MORA = 'EN_MORA',
  CANCELADA = 'CANCELADA',
}

/** Cuánto de la venta se devolvió (no se mezcla con EstadoVenta, que es de cobro/crédito). */
export enum EstadoDevolucionVenta {
  NINGUNA = 'NINGUNA',
  PARCIAL = 'PARCIAL',
  TOTAL = 'TOTAL',
}
