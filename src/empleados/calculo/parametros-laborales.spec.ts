import { INICIO_NOCTURNO, JORNADA_SEMANAL, RECARGO_DOMINICAL, divisorHora, valorVigente } from './parametros-laborales';
import { domingoDePascua, esDominicalOFestivo, festivosDelAnio } from './festivos-colombia';

describe('festivosDelAnio', () => {
  it('2026 coincide con la lista oficial', () => {
    expect([...festivosDelAnio(2026)].sort()).toEqual([
      '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-18', '2026-06-08',
      '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16',
      '2026-12-08', '2026-12-25',
    ]);
  });

  it('Pascua: 2025-04-20, 2026-04-05, 2027-03-28', () => {
    expect(domingoDePascua(2025)).toBe('2025-04-20');
    expect(domingoDePascua(2026)).toBe('2026-04-05');
    expect(domingoDePascua(2027)).toBe('2027-03-28');
  });

  it('esDominicalOFestivo', () => {
    expect(esDominicalOFestivo('2026-10-11')).toBe(true); // domingo
    expect(esDominicalOFestivo('2026-10-12')).toBe(true); // festivo (Día de la Raza, lunes)
    expect(esDominicalOFestivo('2026-10-13')).toBe(false);
  });
});

describe('parámetros laborales', () => {
  it('recargo dominical por fecha', () => {
    expect(valorVigente(RECARGO_DOMINICAL, '2025-06-30')).toBe(0.75);
    expect(valorVigente(RECARGO_DOMINICAL, '2026-06-30')).toBe(0.8);
    expect(valorVigente(RECARGO_DOMINICAL, '2026-07-01')).toBe(0.9);
    expect(valorVigente(RECARGO_DOMINICAL, '2027-07-01')).toBe(1);
  });

  it('inicio nocturno cambia el 25/12/2025', () => {
    expect(valorVigente(INICIO_NOCTURNO, '2025-12-24')).toBe(21 * 60);
    expect(valorVigente(INICIO_NOCTURNO, '2025-12-25')).toBe(19 * 60);
  });

  it('jornada semanal', () => {
    expect(valorVigente(JORNADA_SEMANAL, '2026-07-14')).toBe(44);
    expect(valorVigente(JORNADA_SEMANAL, '2026-07-15')).toBe(42);
  });

  it('divisor del valor hora', () => {
    expect(divisorHora('2026-07-14')).toBe(220);
    expect(divisorHora('2026-07-15')).toBe(210);
  });
});
