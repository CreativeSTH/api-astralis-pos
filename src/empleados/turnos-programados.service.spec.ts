import { BadRequestException, ConflictException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { TurnosProgramadosService } from './turnos-programados.service';

type Fila = Record<string, any>;

const EMP = '11111111-1111-4111-8111-111111111111';
const EMP2 = '22222222-2222-4222-8222-222222222222';
const SUC = '33333333-3333-4333-8333-333333333333';

/** Compara un valor contra un `where` de TypeORM: valores simples, Between e In. */
function coincide(fila: Fila, where: Fila): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v instanceof FindOperator) {
      if (v.type === 'between') {
        const [a, b] = v.value as unknown as [string, string];
        return fila[k] >= a && fila[k] <= b;
      }
      if (v.type === 'in') return (v.value as unknown as unknown[]).includes(fila[k]);
      throw new Error(`operador no soportado: ${v.type}`);
    }
    return fila[k] === v;
  });
}

function entorno(o: { turnos?: Fila[]; empleadoExiste?: boolean; sucursalExiste?: boolean } = {}) {
  let n = 0;
  const turnos: Fila[] = (o.turnos ?? []).map((t) => ({ id: `t-${++n}`, negocioId: 'neg-1', sucursalId: SUC, nota: null, ...t }));
  const repo = {
    find: jest.fn(async ({ where }) => turnos.filter((t) => coincide(t, where)).map((t) => ({ ...t }))),
    findOne: jest.fn(async ({ where }) => {
      const t = turnos.find((x) => coincide(x, where));
      return t ? { ...t } : null;
    }),
    create: jest.fn((x) => ({ ...x })),
    save: jest.fn(async (x) => {
      const fila = { id: x.id ?? `t-${++n}`, ...x };
      // Postgres devuelve `time` con segundos
      fila.horaInicio = fila.horaInicio.length === 5 ? `${fila.horaInicio}:00` : fila.horaInicio;
      fila.horaFin = fila.horaFin.length === 5 ? `${fila.horaFin}:00` : fila.horaFin;
      const i = turnos.findIndex((t) => t.id === fila.id);
      if (i >= 0) turnos[i] = { ...turnos[i], ...fila };
      else turnos.push(fila);
      return { ...fila };
    }),
    delete: jest.fn(async ({ id }) => {
      const i = turnos.findIndex((t) => t.id === id);
      if (i >= 0) turnos.splice(i, 1);
      return { affected: i >= 0 ? 1 : 0 };
    }),
  };
  const empleadoRepo = { exists: jest.fn(async () => o.empleadoExiste ?? true) };
  const sucursalRepo = { exists: jest.fn(async () => o.sucursalExiste ?? true) };
  const cls = { get: jest.fn(() => 'neg-1') };
  const service = new TurnosProgramadosService(repo as any, empleadoRepo as any, sucursalRepo as any, cls as any);
  return { service, turnos };
}

const turno = (fecha: string, horaInicio: string, horaFin: string, empleadoId = EMP) => ({
  empleadoId,
  sucursalId: SUC,
  fecha,
  horaInicio,
  horaFin,
});

describe('TurnosProgramadosService', () => {
  it('crea un turno', async () => {
    const { service, turnos } = entorno();
    const t = await service.create(turno('2026-10-05', '08:00', '16:00'));
    expect(t).toMatchObject({ negocioId: 'neg-1', fecha: '2026-10-05', horaInicio: '08:00:00' });
    expect(turnos).toHaveLength(1);
  });

  it('rechaza superposición con otro turno del mismo empleado el mismo día', async () => {
    const { service } = entorno({ turnos: [turno('2026-10-05', '08:00:00', '16:00:00')] });
    await expect(service.create(turno('2026-10-05', '15:00', '20:00'))).rejects.toThrow(ConflictException);
    await expect(service.create(turno('2026-10-05', '15:00', '20:00'))).rejects.toThrow(
      'Se cruza con el turno de 2026-10-05 08:00–16:00',
    );
  });

  it('rechaza superposición con un turno de la noche anterior que cruza la medianoche', async () => {
    const { service } = entorno({ turnos: [turno('2026-10-04', '20:00:00', '02:00:00')] });
    await expect(service.create(turno('2026-10-05', '01:00', '09:00'))).rejects.toThrow(ConflictException);
  });

  it('permite turno partido sin superposición y turnos de otro empleado a la misma hora', async () => {
    const { service, turnos } = entorno({ turnos: [turno('2026-10-05', '08:00:00', '12:00:00')] });
    await service.create(turno('2026-10-05', '12:00', '16:00'));
    await service.create(turno('2026-10-05', '08:00', '12:00', EMP2));
    expect(turnos).toHaveLength(3);
  });

  it('rechaza horaInicio igual a horaFin', async () => {
    const { service } = entorno();
    await expect(service.create(turno('2026-10-05', '08:00', '08:00'))).rejects.toThrow(BadRequestException);
  });

  it('al editar no choca consigo mismo', async () => {
    const { service, turnos } = entorno({ turnos: [turno('2026-10-05', '08:00:00', '16:00:00')] });
    await service.update(turnos[0].id, { horaFin: '17:00' });
    expect(turnos[0].horaFin).toBe('17:00:00');
  });

  it('rechaza empleado o sucursal de otro negocio', async () => {
    await expect(entorno({ empleadoExiste: false }).service.create(turno('2026-10-05', '08:00', '16:00'))).rejects.toThrow(
      'El empleado no existe en este negocio',
    );
    await expect(entorno({ sucursalExiste: false }).service.create(turno('2026-10-05', '08:00', '16:00'))).rejects.toThrow(
      'La sucursal no existe en este negocio',
    );
  });

  it('copiarSemana copia la semana anterior desplazada 7 días y omite los que ya existen o se cruzan', async () => {
    const { service, turnos } = entorno({
      turnos: [
        turno('2026-09-28', '08:00:00', '16:00:00'),
        turno('2026-09-30', '08:00:00', '16:00:00'),
        turno('2026-10-04', '20:00:00', '02:00:00'), // domingo que cruza medianoche
        turno('2026-10-02', '09:00:00', '13:00:00', EMP2),
        // ya en destino: idéntico al del lunes, y uno que choca con el del miércoles
        turno('2026-10-05', '08:00:00', '16:00:00'),
        turno('2026-10-07', '12:00:00', '18:00:00'),
      ],
    });
    const r = await service.copiarSemana('2026-10-05');
    expect(r).toEqual({ copiados: 2, omitidos: 2 });
    const destino = turnos.filter((t) => t.fecha >= '2026-10-05').map((t) => `${t.empleadoId === EMP ? 'A' : 'B'} ${t.fecha} ${t.horaInicio}`);
    expect(destino.sort()).toEqual(
      ['A 2026-10-05 08:00:00', 'A 2026-10-07 12:00:00', 'A 2026-10-11 20:00:00', 'B 2026-10-09 09:00:00'].sort(),
    );
  });

  it('copiarSemana filtra por sucursal', async () => {
    const OTRA = '44444444-4444-4444-8444-444444444444';
    const { service } = entorno({
      turnos: [turno('2026-09-28', '08:00:00', '16:00:00'), { ...turno('2026-09-29', '08:00:00', '16:00:00'), sucursalId: OTRA }],
    });
    expect(await service.copiarSemana('2026-10-05', SUC)).toEqual({ copiados: 1, omitidos: 0 });
  });

  it('copiarSemana rechaza una fecha que no es lunes', async () => {
    const { service } = entorno();
    await expect(service.copiarSemana('2026-10-06')).rejects.toThrow('La semana destino debe empezar un lunes');
  });
});
