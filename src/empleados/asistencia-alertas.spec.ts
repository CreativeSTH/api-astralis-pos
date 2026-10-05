import { alertasAsistencia, JornadaLite, TurnoLite } from './asistencia-alertas';

const turno = (fecha: string, horaInicio: string, horaFin: string, id = 't1'): TurnoLite => ({
  id,
  empleadoId: 'e1',
  fecha,
  horaInicio,
  horaFin,
});
const jornada = (entrada: string, salida: string | null, extra: Partial<JornadaLite> = {}): JornadaLite => ({
  id: 'j1',
  empleadoId: 'e1',
  entrada: new Date(entrada),
  salida: salida ? new Date(salida) : null,
  sinSalida: false,
  ...extra,
});

const DESPUES = new Date('2026-10-20T00:00:00Z');

describe('alertasAsistencia', () => {
  it('entrada 8:05 con turno 8:00 → sin alerta (dentro de la tolerancia)', () => {
    // 08:05 Colombia = 13:05Z
    expect(alertasAsistencia([jornada('2026-10-05T13:05:00Z', '2026-10-05T21:00:00Z')], [turno('2026-10-05', '08:00:00', '16:00:00')], DESPUES)).toEqual([]);
  });

  it('entrada 8:15 con turno 8:00 → TARDE 15 min', () => {
    expect(alertasAsistencia([jornada('2026-10-05T13:15:00Z', '2026-10-05T21:00:00Z')], [turno('2026-10-05', '08:00:00', '16:00:00')], DESPUES)).toEqual([
      { tipo: 'TARDE', empleadoId: 'e1', fecha: '2026-10-05', turnoId: 't1', jornadaId: 'j1', minutos: 15 },
    ]);
  });

  it('turno sin jornada → AUSENTE', () => {
    expect(alertasAsistencia([], [turno('2026-10-05', '08:00:00', '16:00:00')], DESPUES)).toEqual([
      { tipo: 'AUSENTE', empleadoId: 'e1', fecha: '2026-10-05', turnoId: 't1' },
    ]);
  });

  it('un turno que aún no empieza no genera ausencia', () => {
    expect(alertasAsistencia([], [turno('2026-10-05', '08:00:00', '16:00:00')], new Date('2026-10-05T12:00:00Z'))).toEqual([]);
  });

  it('jornada sinSalida → SIN_SALIDA con la fecha de entrada en Colombia', () => {
    // 20:00 del 4 en Colombia = 01:00Z del 5
    expect(alertasAsistencia([jornada('2026-10-05T01:00:00Z', null, { sinSalida: true })], [], DESPUES)).toEqual([
      { tipo: 'SIN_SALIDA', empleadoId: 'e1', fecha: '2026-10-04', jornadaId: 'j1' },
    ]);
  });

  it('turno que cruza medianoche cubierto por jornada 20:00–02:00 → sin alerta', () => {
    expect(
      alertasAsistencia([jornada('2026-10-11T01:00:00Z', '2026-10-11T07:00:00Z')], [turno('2026-10-10', '20:00:00', '02:00:00')], DESPUES),
    ).toEqual([]);
  });

  it('jornada abierta (adentro) cubre el turno', () => {
    expect(alertasAsistencia([jornada('2026-10-05T13:00:00Z', null)], [turno('2026-10-05', '08:00:00', '16:00:00')], DESPUES)).toEqual([]);
  });

  it('una jornada de otro empleado no cubre el turno', () => {
    const alertas = alertasAsistencia([jornada('2026-10-05T13:00:00Z', '2026-10-05T21:00:00Z', { empleadoId: 'e2' })], [turno('2026-10-05', '08:00:00', '16:00:00')], DESPUES);
    expect(alertas.map((a) => a.tipo)).toEqual(['AUSENTE']);
  });
});
