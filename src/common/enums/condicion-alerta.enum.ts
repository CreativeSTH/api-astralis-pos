/**
 * Condiciones disponibles para una `ReglaAlerta` — cada una se evalúa dentro
 * de `AlertasService.evaluarReglas()` (parte del mismo barrido que corre el
 * cron cada 30 min y el botón "Actualizar"). El campo `parametros.valor` de
 * la regla se interpreta en la unidad que indica cada condición:
 * horas para LISTA_PEDIDOS_SIN_RESOLVER/TURNO_ABIERTO_MUCHO_TIEMPO,
 * días para DESCUADRE_SIN_PAGAR.
 */
export enum TipoCondicionAlerta {
  LISTA_PEDIDOS_SIN_RESOLVER = 'LISTA_PEDIDOS_SIN_RESOLVER',
  TURNO_ABIERTO_MUCHO_TIEMPO = 'TURNO_ABIERTO_MUCHO_TIEMPO',
  DESCUADRE_SIN_PAGAR = 'DESCUADRE_SIN_PAGAR',
}
