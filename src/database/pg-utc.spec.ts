import { defaults, types } from 'pg';
import { configurarPgEnUtc } from './pg-utc';

// `pg/lib/utils` no trae tipos — es la misma función que usa `pg` para serializar parámetros.
const { prepareValue } = jest.requireActual<{
  prepareValue: (valor: unknown) => unknown;
}>('pg/lib/utils');

/**
 * La base corre en UTC y guarda `created_at` como `timestamp` SIN zona. Sin este ajuste, `pg`
 * interpreta esas columnas en la zona horaria del proceso Node (America/Bogota en desarrollo):
 * medido en vivo, una venta guardada 02:01 UTC salía por la API como 07:01Z, 5 h corrida.
 */
describe('configurarPgEnUtc', () => {
  const TIMESTAMP_SIN_ZONA = 1114;
  /** `pg-types` tipa el parser como `any`. */
  const parserTimestamp = () =>
    types.getTypeParser(TIMESTAMP_SIN_ZONA) as (valor: string) => unknown;

  beforeAll(() => configurarPgEnUtc());

  it('lee un timestamp sin zona como UTC, con precisión de milisegundos', () => {
    const parsear = parserTimestamp();
    expect((parsear('2026-09-29 02:01:13.653037') as Date).toISOString()).toBe(
      '2026-09-29T02:01:13.653Z',
    );
    expect((parsear('2026-09-29 02:01:13') as Date).toISOString()).toBe(
      '2026-09-29T02:01:13.000Z',
    );
  });

  it('respeta los valores especiales de Postgres', () => {
    const parsear = parserTimestamp();
    expect(parsear('infinity')).toBe(Infinity);
    expect(parsear('-infinity')).toBe(-Infinity);
  });

  it('escribe los Date en UTC — Postgres descarta el offset al compararlos contra un timestamp sin zona', () => {
    expect(defaults.parseInputDatesAsUTC).toBe(true);
    expect(prepareValue(new Date('2026-09-29T00:00:00.000Z'))).toBe(
      '2026-09-29T00:00:00.000+00:00',
    );
  });
});
