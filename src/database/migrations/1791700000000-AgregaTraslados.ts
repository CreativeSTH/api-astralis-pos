import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Traslados entre bodegas (spec 2026-10-04, Fase 2). La fila de permiso TRASLADOS la crea
 * `npm run seed` (PermisosService.sembrarCatalogo): un valor de enum recién agregado no se puede
 * usar dentro de la misma transacción de la migración. `movimientos_inventario.traslado_id` va sin
 * FK, igual que `venta_id`: la entidad no declara la relación y `synchronize` la borraría en dev.
 */
export class AgregaTraslados1791700000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    for (const valor of ['TRASLADO_SALIDA', 'TRASLADO_ENTRADA', 'TRASLADO_CANCELADO', 'FALTANTE_TRASLADO']) {
      await q.query(`ALTER TYPE "public"."movimientos_inventario_tipo_enum" ADD VALUE IF NOT EXISTS '${valor}'`);
    }
    await q.query(`ALTER TYPE "public"."permisos_modulo_enum" ADD VALUE IF NOT EXISTS 'TRASLADOS'`);
    await q.query(`ALTER TYPE "public"."registros_auditoria_modulo_enum" ADD VALUE IF NOT EXISTS 'TRASLADOS'`);
    await q.query(`CREATE TYPE "public"."traslados_estado_enum" AS ENUM('EN_TRANSITO', 'RECIBIDO', 'CANCELADO')`);
    await q.query(
      `CREATE TABLE "traslados" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "consecutivo" integer NOT NULL, "bodega_origen_id" uuid NOT NULL, "bodega_destino_id" uuid NOT NULL, "estado" "public"."traslados_estado_enum" NOT NULL DEFAULT 'EN_TRANSITO', "nota" text, "enviado_por" character varying NOT NULL, "enviado_en" TIMESTAMP WITH TIME ZONE NOT NULL, "recibido_por" character varying, "recibido_en" TIMESTAMP WITH TIME ZONE, "cancelado_por" character varying, "cancelado_en" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_9fde68e784845c07e37af4af951" PRIMARY KEY ("id"))`,
    );
    await q.query(`CREATE INDEX "IDX_traslados_negocio" ON "traslados" ("negocio_id")`);
    await q.query(`CREATE UNIQUE INDEX "UQ_traslados_negocio_consecutivo" ON "traslados" ("negocio_id", "consecutivo")`);
    await q.query(
      `CREATE TABLE "traslado_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "traslado_id" uuid NOT NULL, "producto_id" uuid NOT NULL, "cantidad_enviada" numeric(12,2) NOT NULL, "cantidad_recibida" numeric(12,2), CONSTRAINT "PK_9b7d6cde4906ebf02899de92c84" PRIMARY KEY ("id"))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_traslado_items_traslado_producto" ON "traslado_items" ("traslado_id", "producto_id")`,
    );
    await q.query(`ALTER TABLE "movimientos_inventario" ADD "traslado_id" uuid`);
    await q.query(
      `ALTER TABLE "traslados" ADD CONSTRAINT "FK_55ac724a859d91049f8e8e4083d" FOREIGN KEY ("bodega_origen_id") REFERENCES "bodegas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE "traslados" ADD CONSTRAINT "FK_3bd1ae8264705ae7355059abafc" FOREIGN KEY ("bodega_destino_id") REFERENCES "bodegas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE "traslado_items" ADD CONSTRAINT "FK_4bb2e24ac68eb3bdc3214c2cff8" FOREIGN KEY ("traslado_id") REFERENCES "traslados"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE "traslado_items" ADD CONSTRAINT "FK_e7301a6b756452c8165ff1d87bd" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "movimientos_inventario" DROP COLUMN "traslado_id"`);
    await q.query(`DROP TABLE "traslado_items"`);
    await q.query(`DROP TABLE "traslados"`);
    await q.query(`DROP TYPE "public"."traslados_estado_enum"`);
    await q.query(
      `DELETE FROM "movimientos_inventario" WHERE "tipo" IN ('TRASLADO_SALIDA', 'TRASLADO_ENTRADA', 'TRASLADO_CANCELADO', 'FALTANTE_TRASLADO')`,
    );
    for (const valor of ['TRASLADO_SALIDA', 'TRASLADO_ENTRADA', 'TRASLADO_CANCELADO', 'FALTANTE_TRASLADO']) {
      await this.recrearEnumSin(q, 'movimientos_inventario', 'tipo', 'movimientos_inventario_tipo_enum', valor);
    }
    await q.query(
      `DELETE FROM "rol_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "modulo" = 'TRASLADOS')`,
    );
    await q.query(`DELETE FROM "permisos" WHERE "modulo" = 'TRASLADOS'`);
    await this.recrearEnumSin(q, 'permisos', 'modulo', 'permisos_modulo_enum', 'TRASLADOS');
    await q.query(`DELETE FROM "registros_auditoria" WHERE "modulo" = 'TRASLADOS'`);
    await this.recrearEnumSin(q, 'registros_auditoria', 'modulo', 'registros_auditoria_modulo_enum', 'TRASLADOS');
  }

  /** Mismo helper que 1791500000000-AgregaAuditoria. */
  private async recrearEnumSin(
    q: QueryRunner,
    tabla: string,
    columna: string,
    tipo: string,
    quitar: string,
  ): Promise<void> {
    const filas: { v: string }[] = await q.query(
      `SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder`,
      [tipo],
    );
    const valores = filas
      .map((f) => f.v)
      .filter((v) => v !== quitar)
      .map((v) => `'${v}'`)
      .join(', ');
    await q.query(`CREATE TYPE "public"."${tipo}_old" AS ENUM(${valores})`);
    await q.query(
      `ALTER TABLE "${tabla}" ALTER COLUMN "${columna}" TYPE "public"."${tipo}_old" USING "${columna}"::"text"::"public"."${tipo}_old"`,
    );
    await q.query(`DROP TYPE "public"."${tipo}"`);
    await q.query(`ALTER TYPE "public"."${tipo}_old" RENAME TO "${tipo}"`);
  }
}
