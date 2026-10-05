import { calcularRecargos, EntradaCalculo } from './calculo-recargos';
import { instanteColombia } from './tiempo-colombia';


/** 'YYYY-MM-DD HH:MM' en hora Colombia → jornada. */
function j(desde: string, hasta: string) {
  const [fd, hd] = desde.split(' ');
  const [fh, hh] = hasta.split(' ');
  return { entrada: instanteColombia(fd, hd), salida: instanteColombia(fh, hh) };
}
const t = (fecha: string, horaInicio: string, horaFin: string) => ({ fecha, horaInicio, horaFin });

function caso(jornada: { entrada: Date; salida: Date }, turnos: EntradaCalculo['turnos'] = [], salario = 2_100_000): EntradaCalculo {
  return { jornadas: [jornada], turnos, salarioMensual: salario, aplicaHorasExtra: true };
}

/** Lunes 19 a sábado 24 de octubre de 2026 (sin festivos), turnos 07:00–14:00; `salidas` por día (6 valores). */
function semanaCon(salidas: string[]): EntradaCalculo {
  const dias = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
  return {
    jornadas: dias.map((d, i) => j(`${d} 07:00`, `${d} ${salidas[i]}`)),
    turnos: dias.map((d) => t(d, '07:00', '14:00')),
    salarioMensual: 2_100_000,
    aplicaHorasExtra: true,
  };
}
const semana = () => semanaCon(Array(6).fill('14:00'));
const semanaConSabadoHasta = (hora: string) => semanaCon(['14:00', '14:00', '14:00', '14:00', '14:00', hora]);

describe('calcularRecargos', () => {
  it('martes 18–22 h con turno igual: 1 h diurna + 3 h nocturnas → 3 × 35 %', () => {
    const r = calcularRecargos({
      jornadas: [j('2026-10-06 18:00', '2026-10-06 22:00')],
      turnos: [t('2026-10-06', '18:00', '22:00')],
      salarioMensual: 2_100_000,
      aplicaHorasExtra: true,
    });
    expect(r.porTipo.ORDINARIA_DIURNA.minutos).toBe(60);
    expect(r.porTipo.ORDINARIA_NOCTURNA).toEqual({ minutos: 180, valor: 10_500 });
    expect(r.total).toBe(10_500);
  });

  it('domingo 4/10/2026 8–12 h: 4 h diurnas dominicales al 90 %', () => {
    const r = calcularRecargos(caso(j('2026-10-04 08:00', '2026-10-04 12:00')));
    expect(r.porTipo.ORDINARIA_DIURNA_DOMINICAL).toEqual({ minutos: 240, valor: 36_000 });
    expect(r.total).toBe(36_000);
  });

  it('sábado 20:00 → domingo 02:00: 4 h nocturnas + 2 h nocturnas dominicales', () => {
    const r = calcularRecargos(caso(j('2026-10-10 20:00', '2026-10-11 02:00'), [t('2026-10-10', '20:00', '02:00')]));
    expect(r.porTipo.ORDINARIA_NOCTURNA.valor).toBe(14_000);
    expect(r.porTipo.ORDINARIA_NOCTURNA_DOMINICAL.valor).toBe(25_000);
    expect(r.tramos.map((x) => x.fecha)).toEqual(['2026-10-10', '2026-10-11']);
  });

  it('festivo (lunes 12/10/2026) cuenta como dominical', () => {
    expect(calcularRecargos(caso(j('2026-10-12 08:00', '2026-10-12 09:00'))).porTipo.ORDINARIA_DIURNA_DOMINICAL.valor).toBe(9_000);
  });

  it('semana de exactamente 42 h dentro de los turnos: sin extras', () => {
    const r = calcularRecargos(semana());
    expect(r.porTipo.ORDINARIA_DIURNA.minutos).toBe(42 * 60);
    expect(r.total).toBe(0);
  });

  it('44 h con 2 h fuera del turno el sábado: 2 h extra diurna', () => {
    const r = calcularRecargos(semanaConSabadoHasta('16:00'));
    expect(r.porTipo.EXTRA_DIURNA).toEqual({ minutos: 120, valor: 5_000 });
    expect(r.total).toBe(5_000);
  });

  it('48 h: las extras que caen después de las 19:00 son nocturnas', () => {
    const r = calcularRecargos(semanaConSabadoHasta('20:00'));
    expect(r.porTipo.EXTRA_DIURNA).toEqual({ minutos: 300, valor: 12_500 });
    expect(r.porTipo.EXTRA_NOCTURNA).toEqual({ minutos: 60, valor: 7_500 });
  });

  it('el exceso se toma de lo más tardío y parte el tramo si hace falta', () => {
    // 07–17 el sábado (3 h fuera del turno) pero el viernes sale a las 12 (−2 h): semana de 43 h, exceso 1 h.
    const r = calcularRecargos(semanaCon(['14:00', '14:00', '14:00', '14:00', '12:00', '17:00']));
    expect(r.porTipo.EXTRA_DIURNA.minutos).toBe(60);
    const extra = r.tramos.filter((x) => x.extra);
    expect(extra).toHaveLength(1);
    expect(extra[0].inicio.toISOString()).toBe(instanteColombia('2026-10-24', '16:00').toISOString());
    expect(r.porTipo.ORDINARIA_DIURNA.minutos).toBe(42 * 60);
  });

  it('extra nocturna dominical: domingo sin turno tras una semana completa', () => {
    const e = semana();
    e.jornadas.push(j('2026-10-25 20:00', '2026-10-25 22:00'));
    const r = calcularRecargos(e);
    expect(r.porTipo.EXTRA_NOCTURNA_DOMINICAL).toEqual({ minutos: 120, valor: 33_000 });
  });

  it('sin horas extra si aplicaHorasExtra = false', () => {
    const r = calcularRecargos({ ...semanaConSabadoHasta('16:00'), aplicaHorasExtra: false });
    expect(r.total).toBe(0);
    expect(r.porTipo.ORDINARIA_DIURNA.minutos).toBe(44 * 60);
  });

  it('franja nocturna: 20–21 h el 23/12/2025 es diurna; el 26/12/2025 es nocturna', () => {
    expect(calcularRecargos(caso(j('2025-12-23 20:00', '2025-12-23 21:00'), [], 2_200_000)).total).toBe(0);
    expect(calcularRecargos(caso(j('2025-12-26 20:00', '2025-12-26 21:00'), [], 2_200_000)).total).toBe(3_500);
  });

  it('dominical 80 % el 28/06/2026 y 90 % el 05/07/2026 (hora de 10.000 con 44 h)', () => {
    expect(calcularRecargos(caso(j('2026-06-28 08:00', '2026-06-28 09:00'), [], 2_200_000)).total).toBe(8_000);
    expect(calcularRecargos(caso(j('2026-07-05 08:00', '2026-07-05 09:00'), [], 2_200_000)).total).toBe(9_000);
  });

  it('jornada que cruza un cambio de regla: cada tramo usa la de su fecha', () => {
    // 24/12/2025 la noche empieza a las 21:00; el 25/12 (festivo) ya a las 19:00. Hora de 10.000 (44 h).
    const r = calcularRecargos(caso(j('2025-12-24 20:00', '2025-12-25 20:00'), [], 2_200_000));
    expect(r.porTipo.ORDINARIA_DIURNA.minutos).toBe(60); // 24/12 20–21
    expect(r.porTipo.ORDINARIA_NOCTURNA.minutos).toBe(180); // 24/12 21–24
    expect(r.porTipo.ORDINARIA_NOCTURNA_DOMINICAL.minutos).toBe(6 * 60 + 60); // 25/12 00–06 y 19–20
    expect(r.porTipo.ORDINARIA_DIURNA_DOMINICAL.minutos).toBe(13 * 60); // 25/12 06–19
  });

  it('domingo → lunes festivo: ambos tramos dominicales', () => {
    // Domingo 28/06/2026 23:00 → lunes 29/06/2026 (San Pedro) 01:00, dominical al 80 %.
    const r = calcularRecargos(caso(j('2026-06-28 23:00', '2026-06-29 01:00'), [], 2_200_000));
    expect(r.porTipo.ORDINARIA_NOCTURNA_DOMINICAL).toEqual({ minutos: 120, valor: 23_000 });
  });

  it('alerta de más de 2 h extra en un día', () => {
    expect(calcularRecargos(semanaConSabadoHasta('17:00')).alertas).toContainEqual({ tipo: 'EXTRA_DIA', fecha: '2026-10-24', minutos: 180 });
  });

  it('alerta de más de 12 h extra en la semana', () => {
    const r = calcularRecargos(semanaCon(['17:00', '17:00', '17:00', '17:00', '17:00', '14:00']));
    expect(r.alertas).toContainEqual({ tipo: 'EXTRA_SEMANA', fecha: '2026-10-19', minutos: 900 });
  });

  it('redondea al peso por tipo', () => {
    // 2.000.000 / 210 = 9.523,81 la hora; 1 h nocturna al 35 % = 3.333,33
    const r = calcularRecargos(caso(j('2026-10-06 20:00', '2026-10-06 21:00'), [], 2_000_000));
    expect(r.porTipo.ORDINARIA_NOCTURNA.valor).toBe(3_333);
  });
});
