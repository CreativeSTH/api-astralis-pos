import { ForbiddenException } from '@nestjs/common';
import { Negocio } from '../negocios/entities/negocio.entity';
import { ResponsabilidadIva, TipoPersona, OrigenObligacion } from '../negocios/entities/perfil-fiscal.enum';
import { EstadoHabilitacion } from '../facturacion-electronica/entities/estado-habilitacion.enum';
import { TipoComprobanteVenta } from '../common/enums/tipo-comprobante.enum';
import { diaColombia, diasDesdeFechaColombia, sumarDiasColombia } from '../common/utils/fecha-colombia';

/**
 * Días que AURA le da a un negocio obligado para activar la facturación electrónica antes de
 * bloquearle el cobro. Decisión de producto (no plazo legal): la habilitación ante la DIAN a veces
 * se demora y no queremos frenar a un cliente por eso — ver spec de unificación de comprobantes.
 */
export const GRACIA_DIAS = 40;
export const CODIGO_BLOQUEO = 'FACTURACION_ELECTRONICA_OBLIGATORIA';
export const MENSAJE_BLOQUEO = 'Tu negocio debe facturar electrónicamente para seguir vendiendo';

export type ModoFacturacion = 'ELECTRONICA' | 'RECIBO' | 'GRACIA' | 'BLOQUEADO' | 'SIN_DECLARAR';

export interface PerfilFiscal {
  tipoPersona: TipoPersona;
  responsabilidadIva: ResponsabilidadIva;
  declaradoEn: Date;
}

export interface EstadoFacturacion {
  modo: ModoFacturacion;
  /** null = perfil sin declarar. */
  obligado: boolean | null;
  diasGraciaRestantes: number | null;
  /** Último día (calendario Colombia, 'YYYY-MM-DD') en que todavía se puede cobrar sin facturación electrónica. */
  fechaLimiteGracia: string | null;
  perfil: PerfilFiscal | null;
}

export type NegocioFiscal = Pick<
  Negocio,
  'tipoPersona' | 'responsabilidadIva' | 'perfilFiscalDeclaradoEn' | 'obligadoDesde' | 'origenObligacion'
>;

export type HabilitacionResumen = { estado: EstadoHabilitacion; esHabilitacionDePrueba: boolean } | null;

/** Persona jurídica, responsable de IVA o Régimen Simple → obligada a facturar (art. 437 par. 3 ET y DUR 1625). */
export function obligadoPorDeclaracion(tipoPersona: TipoPersona, responsabilidadIva: ResponsabilidadIva): boolean {
  return tipoPersona === TipoPersona.JURIDICA || responsabilidadIva !== ResponsabilidadIva.NO_RESPONSABLE;
}

export function esObligado(n: NegocioFiscal): boolean | null {
  if (n.origenObligacion === OrigenObligacion.TOPE_UVT) return true;
  if (!n.tipoPersona || !n.responsabilidadIva) return null;
  return obligadoPorDeclaracion(n.tipoPersona, n.responsabilidadIva);
}

function perfilDe(n: NegocioFiscal): PerfilFiscal | null {
  if (!n.tipoPersona || !n.responsabilidadIva || !n.perfilFiscalDeclaradoEn) return null;
  return { tipoPersona: n.tipoPersona, responsabilidadIva: n.responsabilidadIva, declaradoEn: n.perfilFiscalDeclaradoEn };
}

export function calcularEstado(n: NegocioFiscal, h: HabilitacionResumen): EstadoFacturacion {
  const obligado = esObligado(n);
  const base = { obligado, diasGraciaRestantes: null, fechaLimiteGracia: null, perfil: perfilDe(n) };
  const habilitado = h !== null && h.estado === EstadoHabilitacion.HABILITADO;
  const deProduccion = habilitado && h !== null && !h.esHabilitacionDePrueba;

  if (deProduccion) return { ...base, modo: 'ELECTRONICA' };
  // Documentos de prueba (trial en sandbox): válidos para quien no está obligado; un obligado sigue en gracia.
  if (habilitado && obligado !== true) return { ...base, modo: 'ELECTRONICA' };
  if (obligado === null) return { ...base, modo: 'SIN_DECLARAR' };
  if (!obligado) return { ...base, modo: 'RECIBO' };

  // Sin fecha (no debería pasar: se fija al declarar o al superar el tope) → cuenta desde hoy, nunca bloquea de golpe.
  const diaInicio = diaColombia(n.obligadoDesde ?? new Date());
  const transcurridos = Math.max(0, diasDesdeFechaColombia(diaInicio));
  const fechaLimiteGracia = sumarDiasColombia(diaInicio, GRACIA_DIAS - 1);
  const diasGraciaRestantes = Math.max(0, GRACIA_DIAS - transcurridos);
  return {
    ...base,
    modo: transcurridos < GRACIA_DIAS ? 'GRACIA' : 'BLOQUEADO',
    diasGraciaRestantes,
    fechaLimiteGracia,
  };
}

/** Único comprobante de la venta según el modo — la factura convencional ya no se asigna a ventas nuevas. */
export function tipoComprobanteParaModo(modo: ModoFacturacion): TipoComprobanteVenta {
  if (modo === 'BLOQUEADO') throw new ForbiddenException({ message: MENSAJE_BLOQUEO, code: CODIGO_BLOQUEO });
  return modo === 'ELECTRONICA' ? TipoComprobanteVenta.FACTURA_ELECTRONICA : TipoComprobanteVenta.RECIBO;
}
