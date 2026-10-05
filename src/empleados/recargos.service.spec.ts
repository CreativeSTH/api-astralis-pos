import { RecargosService } from './recargos.service';
import { instanteColombia } from './calculo/tiempo-colombia';

type Fila = Record<string, any>;

const NORTE = 'suc-norte';
const CENTRO = 'suc-centro';

function jornada(id: string, fecha: string, desde: string, hasta: string, sucursalId = CENTRO, empleadoId = 'e1'): Fila {
  return { id, empleadoId, sucursalId, entrada: instanteColombia(fecha, desde), salida: instanteColombia(fecha, hasta) };
}

/** Semana del 19 al 24/10/2026, turnos 07:00–14:00, el sábado sale a las 16:00 (2 h extra diurnas = 5.000). */
function semana(): Fila[] {
  const dias = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
  return dias.map((d, i) => jornada(`j${i}`, d, '07:00', i === 5 ? '16:00' : '14:00'));
}
const turnos = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'].map((fecha) => ({
  empleadoId: 'e1',
  fecha,
  horaInicio: '07:00:00',
  horaFin: '14:00:00',
}));

function entorno(jornadas: Fila[]) {
  const empleadoRepo = {
    find: jest.fn(async () => [
      { id: 'e1', nombre: 'Ana', tipoDocumento: 'CC', numeroDocumento: '1', salarioMensual: '2100000.00', aplicaHorasExtra: true },
    ]),
  };
  const jornadaRepo = { find: jest.fn(async () => jornadas) };
  const turnoRepo = { find: jest.fn(async () => turnos) };
  const asistencia = { listar: jest.fn(async () => ({ jornadas: [], turnos: [], alertas: [{ tipo: 'AUSENTE' }] })) };
  const cls = { get: jest.fn(() => 'neg-1') };
  return new RecargosService(empleadoRepo as any, jornadaRepo as any, turnoRepo as any, asistencia as any, cls as any);
}

describe('RecargosService', () => {
  it('una semana con 2 h fuera del turno el sábado: 5.000 de extra diurna', async () => {
    const r = await entorno(semana()).reporte({ desde: '2026-10-19', hasta: '2026-10-25' });
    expect(r.empleados).toHaveLength(1);
    expect(r.empleados[0].porTipo.EXTRA_DIURNA).toEqual({ minutos: 120, valor: 5_000 });
    expect(r.empleados[0].empleado.salarioMensual).toBe(2_100_000);
    expect(r.totalGeneral).toBe(5_000);
    expect(r.alertasAsistencia).toEqual([{ tipo: 'AUSENTE' }]);
    expect(r.nota).toContain('No incluye salario');
  });

  it('un período que corta la semana conserva los extras del sábado si el sábado está dentro', async () => {
    const soloSabado = await entorno(semana()).reporte({ desde: '2026-10-24', hasta: '2026-10-31' });
    expect(soloSabado.empleados[0].porTipo.EXTRA_DIURNA.valor).toBe(5_000);
    expect(soloSabado.empleados[0].tramos.every((t) => t.fecha >= '2026-10-24')).toBe(true);

    const sinSabado = await entorno(semana()).reporte({ desde: '2026-10-19', hasta: '2026-10-23' });
    expect(sinSabado.empleados[0].total).toBe(0);
    expect(sinSabado.empleados[0].porTipo.ORDINARIA_DIURNA.minutos).toBe(35 * 60);
  });

  it('el filtro por sucursal no cambia el cálculo de la semana, solo qué tramos se muestran', async () => {
    const jornadas = semana();
    jornadas[5].sucursalId = NORTE; // el sábado (con las extras) en otra sede
    const centro = await entorno(jornadas).reporte({ desde: '2026-10-19', hasta: '2026-10-25', sucursalId: CENTRO });
    expect(centro.empleados[0].total).toBe(0);
    const norte = await entorno(jornadas).reporte({ desde: '2026-10-19', hasta: '2026-10-25', sucursalId: NORTE });
    expect(norte.empleados[0].porTipo.EXTRA_DIURNA.valor).toBe(5_000);
  });

  it('valida el período', async () => {
    await expect(entorno([]).reporte({ desde: '2026-10-10', hasta: '2026-10-01' })).rejects.toThrow('posterior');
    await expect(entorno([]).reporte({ desde: '2026-01-01', hasta: '2026-12-31' })).rejects.toThrow('100 días');
  });

  it('sin jornadas en el período no hay empleados', async () => {
    const r = await entorno([]).reporte({ desde: '2026-10-19', hasta: '2026-10-25' });
    expect(r.empleados).toEqual([]);
    expect(r.totalGeneral).toBe(0);
  });
});
