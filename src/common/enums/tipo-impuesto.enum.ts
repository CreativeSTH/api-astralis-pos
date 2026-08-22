/**
 * Categorías fiscales de IVA (Colombia): GRAVADO tiene un % de IVA aplicado,
 * EXCLUIDO no está sujeto a IVA en absoluto, EXENTO sí hace parte del régimen
 * de IVA pero tributa al 0% — la distinción importa para reportes/DIAN.
 */
export enum TipoImpuesto {
  GRAVADO = 'GRAVADO',
  EXCLUIDO = 'EXCLUIDO',
  EXENTO = 'EXENTO',
}
