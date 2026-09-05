export enum EstadoSuscripcion {
  PRUEBA = 'PRUEBA',
  ACTIVA = 'ACTIVA',
  VENCIDA = 'VENCIDA',
  /** Se comporta como ACTIVA hasta fechaFin (sigue vendiendo/facturando) — solo cambia que nunca vuelve a cobrarse. */
  CANCELADA = 'CANCELADA',
}
