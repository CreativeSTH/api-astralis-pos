import { Negocio } from '../negocios/entities/negocio.entity';
import { OrigenObligacion } from '../negocios/entities/perfil-fiscal.enum';
import { topeEnPesos } from './uvt';

export type NivelTope = 0 | 70 | 90 | 100;

export interface IngresosAnio {
  anio: number;
  ingresos: number;
}

export interface MedicionTope {
  anio: number;
  ingresos: number;
  tope: number;
  /** Sin redondear — para mostrar usar `Math.floor`. */
  porcentaje: number;
  nivel: NivelTope;
}

export interface EvaluacionTope {
  /** El año con mayor porcentaje; null si ningún año tiene UVT cargada. */
  medicion: MedicionTope | null;
  aniosSinUvt: number[];
}

export type AccionTope =
  | { tipo: 'NADA' }
  | { tipo: 'AVISAR'; nivel: 70 | 90 }
  | { tipo: 'MARCAR_OBLIGADO'; avisar: boolean }
  | { tipo: 'LIMPIAR_OBLIGACION' };

export type NegocioTope = Pick<
  Negocio,
  'origenObligacion' | 'avisoTopeUvtNivel' | 'avisoTopeUvtAnio'
>;

export function nivelParaPorcentaje(porcentaje: number): NivelTope {
  if (porcentaje >= 100) return 100;
  if (porcentaje >= 90) return 90;
  if (porcentaje >= 70) return 70;
  return 0;
}

/**
 * Mide cada año contra el tope de su propio año y se queda con el mayor: quien superó 3.500 UVT
 * el año pasado o lo supera en el año en curso deja de cumplir las condiciones de no obligado.
 */
export function evaluarTope(ingresos: IngresosAnio[]): EvaluacionTope {
  const aniosSinUvt: number[] = [];
  let medicion: MedicionTope | null = null;
  for (const { anio, ingresos: monto } of ingresos) {
    const tope = topeEnPesos(anio);
    if (tope === null) {
      aniosSinUvt.push(anio);
      continue;
    }
    const porcentaje = (monto / tope) * 100;
    if (!medicion || porcentaje > medicion.porcentaje) {
      medicion = {
        anio,
        ingresos: monto,
        tope,
        porcentaje,
        nivel: nivelParaPorcentaje(porcentaje),
      };
    }
  }
  return { medicion, aniosSinUvt };
}

/**
 * Qué hacer con un negocio no obligado (o obligado por el propio tope) según su nivel de esta noche.
 * Un aviso por nivel y por año; si se cruzan dos niveles en una corrida, solo el más alto.
 */
export function decidirAccionTope(
  negocio: NegocioTope,
  nivel: NivelTope,
  anioActual: number,
): AccionTope {
  if (negocio.origenObligacion === OrigenObligacion.TOPE_UVT) {
    return nivel < 100 ? { tipo: 'LIMPIAR_OBLIGACION' } : { tipo: 'NADA' };
  }
  // Obligado por declaración: no es candidato del cron (declarar NATURAL + NO_RESPONSABLE deja el origen en null).
  if (negocio.origenObligacion === OrigenObligacion.DECLARADO)
    return { tipo: 'NADA' };

  const nivelAvisado =
    negocio.avisoTopeUvtAnio === anioActual
      ? (negocio.avisoTopeUvtNivel ?? 0)
      : 0;
  if (nivel === 100)
    return { tipo: 'MARCAR_OBLIGADO', avisar: nivelAvisado < 100 };
  if (nivel > nivelAvisado) return { tipo: 'AVISAR', nivel: nivel as 70 | 90 };
  return { tipo: 'NADA' };
}
