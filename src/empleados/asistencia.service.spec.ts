import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { AsistenciaService } from './asistencia.service';
import { OrigenMarca } from './enums';
import { AccionAuditoria } from '../auditoria/enums/accion-auditoria.enum';

type Fila = Record<string, any>;

const EMP = '11111111-1111-4111-8111-111111111111';
const SUC = '33333333-3333-4333-8333-333333333333';
const AHORA = new Date('2026-10-05T21:00:00Z'); // lunes 16:00 en Colombia
const hace = (min: number) => new Date(AHORA.getTime() - min * 60000);

function valor(v: unknown): unknown {
  return v instanceof Date ? v.getTime() : v;
}

/** `where` de TypeORM (objeto o lista = OR) contra una fila en memoria. */
function coincide(fila: Fila, where: Fila | Fila[]): boolean {
  if (Array.isArray(where)) return where.some((w) => coincide(fila, w));
  return Object.entries(where).every(([k, v]) => {
    if (v instanceof FindOperator) {
      const x = valor(fila[k]) as any;
      if (v.type === 'isNull') return fila[k] === null || fila[k] === undefined;
      if (v.type === 'between') {
        const [a, b] = (v.value as unknown as unknown[]).map(valor) as any[];
        return x >= a && x <= b;
      }
      throw new Error(`operador no soportado: ${v.type}`);
    }
    return valor(fila[k]) === valor(v);
  });
}

function entorno(o: { jornadas?: Fila[]; turnos?: Fila[]; sucursalExiste?: boolean; empleadoExiste?: boolean } = {}) {
  let n = 0;
  const jornadas: Fila[] = (o.jornadas ?? []).map((j) => ({
    id: `j-${++n}`,
    negocioId: 'neg-1',
    empleadoId: EMP,
    sucursalId: SUC,
    salida: null,
    sinSalida: false,
    origenEntrada: OrigenMarca.PIN,
    origenSalida: null,
    corregidaPor: null,
    motivoCorreccion: null,
    ...j,
  }));
  const jornadaRepo = {
    find: jest.fn(async ({ where }) => jornadas.filter((j) => coincide(j, where)).map((j) => ({ ...j }))),
    findOne: jest.fn(async ({ where }) => {
      const j = jornadas.find((x) => coincide(x, where));
      return j ? { ...j } : null;
    }),
    create: jest.fn((x) => ({ ...x })),
    save: jest.fn(async (x) => {
      const fila = { id: x.id ?? `j-${++n}`, ...x };
      const i = jornadas.findIndex((j) => j.id === fila.id);
      if (i >= 0) jornadas[i] = { ...jornadas[i], ...fila };
      else jornadas.push({ salida: null, sinSalida: false, origenSalida: null, ...fila });
      return { ...fila };
    }),
    delete: jest.fn(async ({ id }) => {
      const i = jornadas.findIndex((j) => j.id === id);
      if (i >= 0) jornadas.splice(i, 1);
      return { affected: i >= 0 ? 1 : 0 };
    }),
  };
  const turnos: Fila[] = o.turnos ?? [];
  const turnoRepo = { find: jest.fn(async ({ where }) => turnos.filter((t) => coincide(t, where))) };
  const empleadoRepo = {
    findOne: jest.fn(async () => (o.empleadoExiste === false ? null : { id: EMP, nombre: 'Ana' })),
  };
  const sucursalRepo = { exists: jest.fn(async () => o.sucursalExiste ?? true) };
  const empleados = {
    buscarPorPin: jest.fn(async (_neg: string, pin: string) => (pin === '1234' ? { id: EMP, nombre: 'Ana' } : null)),
  };
  const dataSource = { transaction: jest.fn(async (fn) => fn({ getRepository: () => jornadaRepo })) };
  const contexto: Record<string, string> = { negocioId: 'neg-1', usuarioId: 'usr-caja' };
  const cls = { get: jest.fn((k: string) => contexto[k]) };
  const auditoria = { registrarAccion: jest.fn(async () => undefined) };
  const service = new AsistenciaService(
    jornadaRepo as any,
    turnoRepo as any,
    empleadoRepo as any,
    sucursalRepo as any,
    empleados as any,
    dataSource as any,
    cls as any,
    auditoria as any,
  );
  return { service, jornadas, auditoria, contexto };
}

describe('AsistenciaService.marcar', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(AHORA);
  });
  afterEach(() => jest.useRealTimers());

  it('sin jornada abierta crea una ENTRADA con la hora del servidor y la sucursal del cuerpo', async () => {
    const { service, jornadas } = entorno();
    const r = await service.marcar('1234', SUC);
    expect(r).toEqual({ tipo: 'ENTRADA', empleado: { id: EMP, nombre: 'Ana' }, momento: AHORA });
    expect(jornadas).toHaveLength(1);
    expect(jornadas[0]).toMatchObject({ negocioId: 'neg-1', empleadoId: EMP, sucursalId: SUC, entrada: AHORA, origenEntrada: OrigenMarca.PIN });
  });

  it('con jornada abierta de 8 h marca SALIDA con la duración', async () => {
    const { service, jornadas } = entorno({ jornadas: [{ entrada: hace(480) }] });
    const r = await service.marcar('1234', SUC);
    expect(r).toEqual({ tipo: 'SALIDA', empleado: { id: EMP, nombre: 'Ana' }, momento: AHORA, duracionMinutos: 480 });
    expect(jornadas[0]).toMatchObject({ salida: AHORA, origenSalida: OrigenMarca.PIN });
  });

  it('jornada abierta hace 1 minuto → 409', async () => {
    const { service } = entorno({ jornadas: [{ entrada: hace(1) }] });
    await expect(service.marcar('1234', SUC)).rejects.toThrow(new ConflictException('Ya marcaste hace un momento'));
  });

  it('jornada abierta hace 17 h → queda sinSalida y se crea una ENTRADA nueva', async () => {
    const { service, jornadas } = entorno({ jornadas: [{ entrada: hace(17 * 60) }] });
    const r = await service.marcar('1234', SUC);
    expect(r.tipo).toBe('ENTRADA');
    expect(jornadas).toHaveLength(2);
    expect(jornadas[0]).toMatchObject({ sinSalida: true, salida: null });
    expect(jornadas[1]).toMatchObject({ entrada: AHORA, sinSalida: false });
  });

  it('PIN inválido → 400; 5 seguidos bloquean un minuto aunque el sexto sea correcto', async () => {
    const { service } = entorno();
    for (let i = 0; i < 5; i++) {
      await expect(service.marcar('0000', SUC)).rejects.toThrow(new BadRequestException('PIN inválido'));
    }
    const bloqueo = service.marcar('1234', SUC);
    await expect(bloqueo).rejects.toThrow(HttpException);
    await expect(service.marcar('1234', SUC)).rejects.toMatchObject({
      status: 429,
      message: 'Demasiados intentos, espera un minuto',
    });
    jest.setSystemTime(new Date(AHORA.getTime() + 61_000));
    await expect(service.marcar('1234', SUC)).resolves.toMatchObject({ tipo: 'ENTRADA' });
  });

  it('un PIN correcto reinicia el contador de fallos', async () => {
    const { service } = entorno();
    for (let i = 0; i < 4; i++) await expect(service.marcar('0000', SUC)).rejects.toThrow('PIN inválido');
    await service.marcar('1234', SUC);
    await expect(service.marcar('0000', SUC)).rejects.toThrow('PIN inválido');
  });

  it('sucursal de otro negocio → 400', async () => {
    const { service } = entorno({ sucursalExiste: false });
    await expect(service.marcar('1234', SUC)).rejects.toThrow('La sucursal no existe en este negocio');
  });
});

describe('AsistenciaService correcciones y listado', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(AHORA);
  });
  afterEach(() => jest.useRealTimers());

  const base = { empleadoId: EMP, sucursalId: SUC, motivo: 'Olvidó marcar' };

  it('crearManual: salida antes de la entrada → 400', async () => {
    const { service } = entorno();
    await expect(
      service.crearManual({ ...base, entrada: '2026-10-05T13:00:00Z', salida: '2026-10-05T12:00:00Z' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('crearManual: se superpone con otra jornada → 409', async () => {
    const { service } = entorno({ jornadas: [{ entrada: new Date('2026-10-05T13:00:00Z'), salida: new Date('2026-10-05T17:00:00Z') }] });
    await expect(
      service.crearManual({ ...base, entrada: '2026-10-05T16:00:00Z', salida: '2026-10-05T20:00:00Z' }),
    ).rejects.toThrow(ConflictException);
  });

  it('crearManual: queda MANUAL, con quién y por qué, y se audita', async () => {
    const { service, jornadas, auditoria } = entorno();
    await service.crearManual({ ...base, entrada: '2026-10-05T13:00:00Z', salida: '2026-10-05T21:00:00Z' });
    expect(jornadas[0]).toMatchObject({
      origenEntrada: OrigenMarca.MANUAL,
      origenSalida: OrigenMarca.MANUAL,
      corregidaPor: 'usr-caja',
      motivoCorreccion: 'Olvidó marcar',
    });
    expect(auditoria.registrarAccion).toHaveBeenCalledWith(
      expect.objectContaining({ entidad: 'Jornada', accion: AccionAuditoria.CREAR, etiqueta: 'Ana 2026-10-05', descripcion: expect.stringContaining('Olvidó marcar') }),
    );
  });

  it('crearManual: la entrada no puede estar en el futuro', async () => {
    const { service } = entorno();
    await expect(service.crearManual({ ...base, entrada: '2026-10-06T13:00:00Z' })).rejects.toThrow(BadRequestException);
  });

  it('corregir una jornada sinSalida le pone salida y limpia la marca', async () => {
    const { service, jornadas, auditoria } = entorno({ jornadas: [{ entrada: new Date('2026-10-04T13:00:00Z'), sinSalida: true }] });
    await service.corregir('j-1', { salida: '2026-10-04T21:00:00Z', motivo: 'Se fue a las 4' });
    expect(jornadas[0]).toMatchObject({ sinSalida: false, origenSalida: OrigenMarca.MANUAL, motivoCorreccion: 'Se fue a las 4' });
    expect(jornadas[0].salida.toISOString()).toBe('2026-10-04T21:00:00.000Z');
    expect(auditoria.registrarAccion).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: AccionAuditoria.EDITAR,
        cambios: [expect.objectContaining({ campo: 'salida', antes: null, despues: '2026-10-04 16:00' })],
      }),
    );
  });

  it('corregir: salida antes de la entrada → 400', async () => {
    const { service } = entorno({ jornadas: [{ entrada: new Date('2026-10-04T13:00:00Z'), salida: new Date('2026-10-04T21:00:00Z') }] });
    await expect(service.corregir('j-1', { salida: '2026-10-04T12:00:00Z', motivo: 'error' })).rejects.toThrow(BadRequestException);
  });

  it('eliminar borra la jornada y audita el motivo', async () => {
    const { service, jornadas, auditoria } = entorno({ jornadas: [{ entrada: new Date('2026-10-04T13:00:00Z'), salida: new Date('2026-10-04T21:00:00Z') }] });
    await service.eliminar('j-1', 'Marcó por otro');
    expect(jornadas).toHaveLength(0);
    expect(auditoria.registrarAccion).toHaveBeenCalledWith(
      expect.objectContaining({ accion: AccionAuditoria.ELIMINAR, descripcion: expect.stringContaining('Marcó por otro') }),
    );
  });

  it('listar devuelve jornadas del rango, las abiertas y las alertas', async () => {
    const { service } = entorno({
      jornadas: [
        { entrada: new Date('2026-10-05T13:20:00Z'), salida: new Date('2026-10-05T21:00:00Z') }, // 8:20 → tarde 20
        { entrada: new Date('2026-09-20T13:00:00Z'), salida: new Date('2026-09-20T21:00:00Z') }, // fuera del rango
      ],
      turnos: [
        { id: 't1', negocioId: 'neg-1', empleadoId: EMP, sucursalId: SUC, fecha: '2026-10-05', horaInicio: '08:00:00', horaFin: '16:00:00' },
        { id: 't2', negocioId: 'neg-1', empleadoId: EMP, sucursalId: SUC, fecha: '2026-10-04', horaInicio: '08:00:00', horaFin: '16:00:00' },
      ],
    });
    const r = await service.listar({ desde: '2026-10-04', hasta: '2026-10-05' });
    expect(r.jornadas).toHaveLength(1);
    expect(r.turnos).toHaveLength(2);
    expect(r.alertas.map((a) => `${a.tipo} ${a.fecha}`).sort()).toEqual(['AUSENTE 2026-10-04', 'TARDE 2026-10-05']);
  });
});
