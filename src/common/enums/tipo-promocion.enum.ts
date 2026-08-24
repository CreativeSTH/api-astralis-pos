export enum TipoPromocion {
  /** Efecto inmediato sobre el precio del producto — no requiere código, se ve ya en el catálogo del POS. */
  PROMOCION = 'PROMOCION',
  /** Redimible solo si el cajero ingresa el código en el carrito al momento de cobrar. */
  CUPON = 'CUPON',
}
