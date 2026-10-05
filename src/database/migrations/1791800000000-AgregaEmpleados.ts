import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Empleados, turnos programados y jornadas de asistencia (spec 2026-10-04 turnos-horarios-empleados, Fase 1).
 * Las filas de permiso EMPLEADOS las crea `npm run seed` (PermisosService.sembrarCatalogo): un valor de enum
 * recién agregado no se puede usar dentro de la misma transacción de la migración.
 */
export class AgregaEmpleados1791800000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "public"."permisos_modulo_enum" ADD VALUE IF NOT EXISTS 'EMPLEADOS'`);
    await q.query(`ALTER TYPE "public"."registros_auditoria_modulo_enum" ADD VALUE IF NOT EXISTS 'EMPLEADOS'`);
    await q.query(`CREATE TYPE "public"."empleados_tipo_documento_enum" AS ENUM('CC', 'CE', 'PPT', 'PASAPORTE')`);
    await q.query(
      `CREATE TABLE "empleados" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "nombre" character varying NOT NULL, "tipo_documento" "public"."empleados_tipo_documento_enum" NOT NULL DEFAULT 'CC', "numero_documento" character varying NOT NULL, "cargo" character varying, "sucursal_id" uuid, "usuario_id" uuid, "salario_mensual" numeric(12,2) NOT NULL, "aplica_horas_extra" boolean NOT NULL DEFAULT true, "pin_marcacion_hash" character varying NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_73a63a6fcb4266219be3eb0ce8a" PRIMARY KEY ("id"))`,
    );
    await q.query(`CREATE INDEX "IDX_empleados_negocio" ON "empleados" ("negocio_id")`);
    await q.query(`CREATE UNIQUE INDEX "UQ_empleados_usuario" ON "empleados" ("usuario_id") WHERE "usuario_id" IS NOT NULL`);
    await q.query(`CREATE UNIQUE INDEX "UQ_empleados_negocio_documento" ON "empleados" ("negocio_id", "numero_documento")`);
    await q.query(`CREATE TYPE "public"."jornadas_origen_enum" AS ENUM('PIN', 'MANUAL')`);
    await q.query(
      `CREATE TABLE "jornadas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "empleado_id" uuid NOT NULL, "sucursal_id" uuid NOT NULL, "entrada" TIMESTAMP WITH TIME ZONE NOT NULL, "salida" TIMESTAMP WITH TIME ZONE, "origen_entrada" "public"."jornadas_origen_enum" NOT NULL, "origen_salida" "public"."jornadas_origen_enum", "sin_salida" boolean NOT NULL DEFAULT false, "corregida_por" character varying, "motivo_correccion" text, CONSTRAINT "PK_cc8d9132f8c62f8768bdaf7f973" PRIMARY KEY ("id"))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_jornadas_abierta_por_empleado" ON "jornadas" ("empleado_id") WHERE "salida" IS NULL AND "sin_salida" = false`,
    );
    await q.query(`CREATE INDEX "IDX_jornadas_negocio_entrada" ON "jornadas" ("negocio_id", "entrada")`);
    await q.query(
      `CREATE TABLE "turnos_programados" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "empleado_id" uuid NOT NULL, "sucursal_id" uuid NOT NULL, "fecha" date NOT NULL, "hora_inicio" TIME NOT NULL, "hora_fin" TIME NOT NULL, "nota" character varying, CONSTRAINT "PK_9c2923f5055872082da1537887a" PRIMARY KEY ("id"))`,
    );
    await q.query(`CREATE INDEX "IDX_turnos_programados_negocio_fecha" ON "turnos_programados" ("negocio_id", "fecha")`);
    await q.query(
      `ALTER TABLE "empleados" ADD CONSTRAINT "FK_5fe287a576b6db4285b763fc4ba" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE "empleados" ADD CONSTRAINT "FK_8a9bfbf5f1b55c0ca3a16abd3f0" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE "jornadas" ADD CONSTRAINT "FK_9f58a0c8f7dc547c2d0ec67a694" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE "jornadas" ADD CONSTRAINT "FK_08227c0aa4a08e48b3a0afd54f1" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE "turnos_programados" ADD CONSTRAINT "FK_07f87f413b25f38a37a65616058" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE "turnos_programados" ADD CONSTRAINT "FK_91e01074aeec769bab1d0c2518e" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "turnos_programados"`);
    await q.query(`DROP TABLE "jornadas"`);
    await q.query(`DROP TYPE "public"."jornadas_origen_enum"`);
    await q.query(`DROP TABLE "empleados"`);
    await q.query(`DROP TYPE "public"."empleados_tipo_documento_enum"`);
    await q.query(
      `DELETE FROM "rol_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "modulo" = 'EMPLEADOS')`,
    );
    await q.query(`DELETE FROM "permisos" WHERE "modulo" = 'EMPLEADOS'`);
    await this.recrearEnumSin(q, 'permisos', 'modulo', 'permisos_modulo_enum', 'EMPLEADOS');
    await q.query(`DELETE FROM "registros_auditoria" WHERE "modulo" = 'EMPLEADOS'`);
    await this.recrearEnumSin(q, 'registros_auditoria', 'modulo', 'registros_auditoria_modulo_enum', 'EMPLEADOS');
  }

  /** Mismo helper que 1791700000000-AgregaTraslados. */
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
