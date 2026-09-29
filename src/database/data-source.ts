import 'dotenv/config';
// Mismo ajuste que app.module.ts — el CLI no pasa por Nest (ver pg-utc.ts).
import './pg-utc';
import { DataSource } from 'typeorm';
import { join } from 'path';

/**
 * Instancia standalone para el CLI de TypeORM (`migration:generate`/`migration:run`) — separada de
 * `app.module.ts` porque el CLI evalúa este archivo directamente con ts-node, sin pasar por el
 * contenedor de Nest, así que no puede usar `TypeOrmModule.forRootAsync`/`autoLoadEntities`. Misma
 * config de conexión y mismos defaults que `app.module.ts` — si cambian ahí, cambian acá también.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'pos_user',
  password: process.env.DB_PASSWORD ?? 'pos_password',
  database: process.env.DB_NAME ?? 'pos_db',
  entities: [join(__dirname, '../**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
  synchronize: false,
});
