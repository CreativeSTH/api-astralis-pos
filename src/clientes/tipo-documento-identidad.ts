/**
 * Tipos de documento del catálogo DIAN que AURA deja cargar para un cliente (los que aparecen en
 * un punto de venta): 13 CC, 31 NIT, 22 CE, 41 Pasaporte, 12 TI, 47 PEP, 48 PPT. Es el
 * `identificationType` del `customer` de la factura electrónica.
 */
export const TIPOS_DOCUMENTO_IDENTIDAD = ['13', '31', '22', '41', '12', '47', '48'] as const;
