import { instanteColombia, intervaloTurno, lunesDe, partesColombia } from './tiempo-colombia';

describe('tiempo-colombia', () => {
  it('instanteColombia suma las 5 horas de diferencia', () => {
    expect(instanteColombia('2026-10-04', '08:00').toISOString()).toBe('2026-10-04T13:00:00.000Z');
    expect(instanteColombia('2026-10-04', '20:30:15').toISOString()).toBe('2026-10-05T01:30:15.000Z');
  });

  it('partesColombia devuelve el día local aunque en UTC ya sea el siguiente', () => {
    expect(partesColombia(new Date('2026-10-05T01:30:00Z'))).toEqual({ fecha: '2026-10-04', diaSemana: 0, minutosDelDia: 20 * 60 + 30 });
  });

  it('intervaloTurno cruza la medianoche cuando fin <= inicio', () => {
    const t = intervaloTurno('2026-10-10', '20:00', '02:00');
    expect(t.inicio.toISOString()).toBe('2026-10-11T01:00:00.000Z');
    expect(t.fin.toISOString()).toBe('2026-10-11T07:00:00.000Z');
    const normal = intervaloTurno('2026-10-10', '08:00:00', '16:00:00');
    expect(normal.fin.getTime() - normal.inicio.getTime()).toBe(8 * 3600 * 1000);
  });

  it('lunesDe', () => {
    expect(lunesDe('2026-10-04')).toBe('2026-09-28');
    expect(lunesDe('2026-10-05')).toBe('2026-10-05');
    expect(lunesDe('2026-10-07')).toBe('2026-10-05');
  });
});
