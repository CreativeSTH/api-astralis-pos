import { defaults, types } from 'pg';

const TIMESTAMP_SIN_ZONA = 1114;

/**
 * La base corre en UTC y las columnas `created_at`/`updated_at` (BaseEntity) son `timestamp` SIN
 * zona, llenadas con `now()` — o sea, hora UTC. Por defecto `pg` las lee y escribe en la zona del
 * proceso Node: en un servidor en America/Bogota cada fecha salía 5 h corrida por la API, y al
 * comparar un `Date` contra esas columnas Postgres descarta el offset, así que los filtros por
 * rango quedaban medio día desplazados. Esto fija ambos sentidos en UTC, sin depender de `TZ`.
 *
 * Idempotente. Tiene que correr antes de que TypeORM abra el pool: lo importan `app.module.ts`
 * (app, seed) y `data-source.ts` (CLI de migraciones).
 */
export function configurarPgEnUtc(): void {
  defaults.parseInputDatesAsUTC = true;
  types.setTypeParser(TIMESTAMP_SIN_ZONA, (valor: string) => {
    if (valor === 'infinity') return Infinity;
    if (valor === '-infinity') return -Infinity;
    return new Date(`${valor.replace(' ', 'T')}Z`);
  });
}

configurarPgEnUtc();
