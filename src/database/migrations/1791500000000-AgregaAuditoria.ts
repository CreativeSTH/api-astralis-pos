import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Auditoría / historial de cambios (spec 2026-10-02). La fila de permiso AUDITORIA:VER la crea
 * `npm run seed` (PermisosService.sembrarCatalogo), igual que DEVOLUCIONES: un valor de enum recién
 * agregado no se puede usar dentro de la misma transacción de la migración.
 * El tipo `registros_auditoria_modulo_enum` se arma leyendo `permisos_modulo_enum` para no copiar la lista.
 */
export class AgregaAuditoria1791500000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TYPE "public"."permisos_modulo_enum" ADD VALUE IF NOT EXISTS 'AUDITORIA'`,
    );
    const filas: { v: string }[] = await q.query(
      `SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'permisos_modulo_enum' ORDER BY e.enumsortorder`,
    );
    const modulos = filas.map((f) => `'${f.v}'`).join(', ');
    await q.query(
      `CREATE TYPE "public"."registros_auditoria_modulo_enum" AS ENUM(${modulos})`,
    );
    await q.query(
      `CREATE TYPE "public"."registros_auditoria_origen_enum" AS ENUM('USUARIO', 'SISTEMA', 'WEBHOOK', 'TIENDA_ONLINE')`,
    );
    await q.query(
      `CREATE TYPE "public"."registros_auditoria_accion_enum" AS ENUM('CREAR', 'EDITAR', 'DESACTIVAR', 'REACTIVAR', 'ELIMINAR', 'ANULAR', 'ABRIR', 'CERRAR', 'AJUSTAR', 'EMITIR', 'CANCELAR', 'REGISTRAR', 'CAMBIAR_PERMISOS')`,
    );
    await q.query(
      `CREATE TABLE "registros_auditoria" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "usuario_id" character varying, "usuario_nombre" character varying, "origen" "public"."registros_auditoria_origen_enum" NOT NULL, "sucursal_id" character varying, "modulo" "public"."registros_auditoria_modulo_enum" NOT NULL, "entidad" character varying NOT NULL, "entidad_id" character varying NOT NULL, "entidad_etiqueta" character varying NOT NULL, "accion" "public"."registros_auditoria_accion_enum" NOT NULL, "descripcion" text NOT NULL, "cambios" jsonb, CONSTRAINT "PK_registros_auditoria" PRIMARY KEY ("id"))`,
    );
    await q.query(
      `CREATE INDEX "IDX_registros_auditoria_negocio_created" ON "registros_auditoria" ("negocio_id", "created_at")`,
    );
    await q.query(
      `CREATE INDEX "IDX_registros_auditoria_entidad" ON "registros_auditoria" ("negocio_id", "entidad", "entidad_id", "created_at")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "registros_auditoria"`);
    await q.query(`DROP TYPE "public"."registros_auditoria_accion_enum"`);
    await q.query(`DROP TYPE "public"."registros_auditoria_origen_enum"`);
    await q.query(`DROP TYPE "public"."registros_auditoria_modulo_enum"`);
    await q.query(
      `DELETE FROM "rol_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "modulo" = 'AUDITORIA')`,
    );
    await q.query(`DELETE FROM "permisos" WHERE "modulo" = 'AUDITORIA'`);
    await this.recrearEnumSin(
      q,
      'permisos',
      'modulo',
      'permisos_modulo_enum',
      'AUDITORIA',
    );
  }

  /** Mismo helper que 1791400000000-AgregaDevoluciones. */
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
