/** Tipo de persona según el RUT — las personas jurídicas siempre están obligadas a facturar. */
export enum TipoPersona {
  NATURAL = 'NATURAL',
  JURIDICA = 'JURIDICA',
}

/** Responsabilidad de IVA en el RUT: 48 responsable, 49 no responsable, 47 Régimen Simple. */
export enum ResponsabilidadIva {
  RESPONSABLE = 'RESPONSABLE',
  NO_RESPONSABLE = 'NO_RESPONSABLE',
  REGIMEN_SIMPLE = 'REGIMEN_SIMPLE',
}

/** De dónde sale `Negocio.obligadoDesde`: lo declaró el negocio o AURA detectó el tope de 3.500 UVT (fase 3). */
export enum OrigenObligacion {
  DECLARADO = 'DECLARADO',
  TOPE_UVT = 'TOPE_UVT',
}
