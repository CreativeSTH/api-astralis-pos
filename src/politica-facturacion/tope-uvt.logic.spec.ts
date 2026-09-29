import { topeEnPesos, UVT_POR_ANIO } from './uvt';
import {
  decidirAccionTope,
  evaluarTope,
  nivelParaPorcentaje,
} from './tope-uvt.logic';
import { OrigenObligacion } from '../negocios/entities/perfil-fiscal.enum';

describe('uvt', () => {
  it('tope en pesos = 3.500 UVT del año', () => {
    expect(UVT_POR_ANIO[2025]).toBe(49_799);
    expect(topeEnPesos(2025)).toBe(174_296_500);
    expect(topeEnPesos(2026)).toBe(183_309_000);
  });

  it('año sin UVT → null', () => {
    expect(topeEnPesos(2030)).toBeNull();
  });
});

describe('nivelParaPorcentaje', () => {
  it.each([
    [0, 0],
    [69.99, 0],
    [70, 70],
    [89.99, 70],
    [90, 90],
    [99.99, 90],
    [100, 100],
    [250, 100],
  ])('%p %% → nivel %p', (porcentaje, nivel) => {
    expect(nivelParaPorcentaje(porcentaje)).toBe(nivel);
  });
});

describe('evaluarTope', () => {
  it('toma el año con mayor porcentaje, cada uno contra su propio tope', () => {
    // 2026: 50 % de 183.309.000 · 2025: 170.000.000 / 174.296.500 ≈ 97,5 %
    const { medicion, aniosSinUvt } = evaluarTope([
      { anio: 2026, ingresos: 91_654_500 },
      { anio: 2025, ingresos: 170_000_000 },
    ]);
    expect(aniosSinUvt).toEqual([]);
    expect(medicion).toMatchObject({
      anio: 2025,
      ingresos: 170_000_000,
      tope: 174_296_500,
      nivel: 90,
    });
    expect(medicion!.porcentaje).toBeCloseTo(97.5, 1);
  });

  it('año en curso al 72 %', () => {
    const { medicion } = evaluarTope([
      { anio: 2026, ingresos: 132_000_000 },
      { anio: 2025, ingresos: 0 },
    ]);
    expect(medicion).toMatchObject({ anio: 2026, nivel: 70 });
  });

  it('un año sin UVT se salta y se reporta; el otro se sigue evaluando', () => {
    const { medicion, aniosSinUvt } = evaluarTope([
      { anio: 2027, ingresos: 999_000_000 },
      { anio: 2026, ingresos: 190_000_000 },
    ]);
    expect(aniosSinUvt).toEqual([2027]);
    expect(medicion).toMatchObject({ anio: 2026, nivel: 100 });
  });

  it('ningún año con UVT → sin medición (nunca marca obligado por un dato faltante)', () => {
    const { medicion, aniosSinUvt } = evaluarTope([
      { anio: 2029, ingresos: 999_000_000 },
      { anio: 2028, ingresos: 999_000_000 },
    ]);
    expect(medicion).toBeNull();
    expect(aniosSinUvt).toEqual([2029, 2028]);
  });
});

describe('decidirAccionTope', () => {
  const sinAviso = {
    origenObligacion: null,
    avisoTopeUvtNivel: null,
    avisoTopeUvtAnio: null,
  };

  it('bajo el 70 % → nada', () => {
    expect(decidirAccionTope(sinAviso, 0, 2026)).toEqual({ tipo: 'NADA' });
  });

  it('primer 70 % del año → avisar 70', () => {
    expect(decidirAccionTope(sinAviso, 70, 2026)).toEqual({
      tipo: 'AVISAR',
      nivel: 70,
    });
  });

  it('70 ya avisado este año → nada; 90 → avisar 90', () => {
    const avisado70 = {
      ...sinAviso,
      avisoTopeUvtNivel: 70,
      avisoTopeUvtAnio: 2026,
    };
    expect(decidirAccionTope(avisado70, 70, 2026)).toEqual({ tipo: 'NADA' });
    expect(decidirAccionTope(avisado70, 90, 2026)).toEqual({
      tipo: 'AVISAR',
      nivel: 90,
    });
  });

  it('el aviso de otro año no cuenta', () => {
    const avisado2025 = {
      ...sinAviso,
      avisoTopeUvtNivel: 90,
      avisoTopeUvtAnio: 2025,
    };
    expect(decidirAccionTope(avisado2025, 70, 2026)).toEqual({
      tipo: 'AVISAR',
      nivel: 70,
    });
  });

  it('100 % → marcar obligado y avisar', () => {
    expect(decidirAccionTope(sinAviso, 100, 2026)).toEqual({
      tipo: 'MARCAR_OBLIGADO',
      avisar: true,
    });
  });

  it('100 % con el 100 ya avisado este año (obligación limpiada y vuelta a superar) → marcar sin repetir el aviso', () => {
    const avisado100 = {
      ...sinAviso,
      avisoTopeUvtNivel: 100,
      avisoTopeUvtAnio: 2026,
    };
    expect(decidirAccionTope(avisado100, 100, 2026)).toEqual({
      tipo: 'MARCAR_OBLIGADO',
      avisar: false,
    });
  });

  it('obligado por TOPE_UVT y sigue ≥ 100 % → nada (sin más avisos)', () => {
    const obligado = {
      ...sinAviso,
      origenObligacion: OrigenObligacion.TOPE_UVT,
      avisoTopeUvtNivel: 100,
      avisoTopeUvtAnio: 2026,
    };
    expect(decidirAccionTope(obligado, 100, 2026)).toEqual({ tipo: 'NADA' });
  });

  it('obligado por TOPE_UVT y ambos años bajo el tope → limpiar obligación', () => {
    const obligado = {
      ...sinAviso,
      origenObligacion: OrigenObligacion.TOPE_UVT,
    };
    expect(decidirAccionTope(obligado, 90, 2028)).toEqual({
      tipo: 'LIMPIAR_OBLIGACION',
    });
    expect(decidirAccionTope(obligado, 0, 2028)).toEqual({
      tipo: 'LIMPIAR_OBLIGACION',
    });
  });

  it('obligado por declaración (no debería llegar como candidato) → nada', () => {
    const declarado = {
      ...sinAviso,
      origenObligacion: OrigenObligacion.DECLARADO,
    };
    expect(decidirAccionTope(declarado, 100, 2026)).toEqual({ tipo: 'NADA' });
  });
});
