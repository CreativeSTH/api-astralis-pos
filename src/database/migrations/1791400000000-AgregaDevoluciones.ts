import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Devoluciones + notas crédito (spec 2026-10-02): tablas de devolución, saldo a favor del cliente,
 * estado de devolución de la venta, nota crédito en documentos_electronicos (el índice único de
 * venta_id pasa a parcial: una sola FACTURA por venta, varias NOTA_CREDITO) y enums nuevos.
 * `IF NOT EXISTS` en los ADD VALUE para no fallar en bases de dev donde synchronize ya los agregó.
 */
export class AgregaDevoluciones1791400000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "public"."numeraciones_comprobante_tipo_enum" ADD VALUE IF NOT EXISTS 'DEVOLUCION'`);
    await q.query(`ALTER TYPE "public"."movimientos_inventario_tipo_enum" ADD VALUE IF NOT EXISTS 'BAJA_DEVOLUCION'`);
    await q.query(`ALTER TYPE "public"."permisos_modulo_enum" ADD VALUE IF NOT EXISTS 'DEVOLUCIONES'`);

    await q.query(
      `CREATE TABLE "devoluciones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "sucursal_id" character varying NOT NULL, "venta_id" character varying NOT NULL, "turno_id" character varying, "numero" integer NOT NULL, "numero_completo" character varying NOT NULL, "motivo" text NOT NULL, "total" numeric(12,2) NOT NULL, "base_total" numeric(12,2) NOT NULL, "impuesto_total" numeric(12,2) NOT NULL, "descuento_venta_total" numeric(12,2) NOT NULL DEFAULT '0', "creado_por" character varying NOT NULL, "autorizado_por" character varying NOT NULL, CONSTRAINT "PK_devoluciones" PRIMARY KEY ("id"))`,
    );
    await q.query(`CREATE INDEX "IDX_devoluciones_negocio" ON "devoluciones" ("negocio_id")`);
    await q.query(`CREATE INDEX "IDX_devoluciones_venta" ON "devoluciones" ("venta_id")`);
    await q.query(`CREATE INDEX "IDX_devoluciones_negocio_created" ON "devoluciones" ("negocio_id", "created_at")`);

    await q.query(
      `CREATE TABLE "devolucion_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "devolucion_id" uuid NOT NULL, "venta_item_id" character varying NOT NULL, "producto_id" character varying NOT NULL, "nombre_producto" character varying NOT NULL, "cantidad" numeric(12,2) NOT NULL, "precio_unitario" numeric(12,2) NOT NULL, "base" numeric(12,2) NOT NULL, "impuesto" numeric(12,2) NOT NULL, "descuento_venta" numeric(12,2) NOT NULL DEFAULT '0', "total" numeric(12,2) NOT NULL, "vuelve_a_inventario" boolean NOT NULL DEFAULT true, "motivo_baja" text, CONSTRAINT "PK_devolucion_items" PRIMARY KEY ("id"))`,
    );
    await q.query(
      `ALTER TABLE "devolucion_items" ADD CONSTRAINT "FK_32f738f73a1f533068bfbb20bf0" FOREIGN KEY ("devolucion_id") REFERENCES "devoluciones"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await q.query(
      `CREATE TABLE "devolucion_reembolsos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "devolucion_id" uuid NOT NULL, "forma" character varying NOT NULL, "monto" numeric(12,2) NOT NULL, CONSTRAINT "PK_devolucion_reembolsos" PRIMARY KEY ("id"))`,
    );
    await q.query(
      `ALTER TABLE "devolucion_reembolsos" ADD CONSTRAINT "FK_852964cec532ee9eefadb301f16" FOREIGN KEY ("devolucion_id") REFERENCES "devoluciones"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await q.query(
      `CREATE TABLE "movimientos_saldo_cliente" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "cliente_id" character varying NOT NULL, "tipo" character varying NOT NULL, "monto" numeric(12,2) NOT NULL, "devolucion_id" character varying, "venta_id" character varying, "creado_por" character varying NOT NULL, CONSTRAINT "PK_movimientos_saldo_cliente" PRIMARY KEY ("id"))`,
    );
    await q.query(`CREATE INDEX "IDX_movimientos_saldo_cliente_negocio" ON "movimientos_saldo_cliente" ("negocio_id")`);
    await q.query(`CREATE INDEX "IDX_movimientos_saldo_cliente_cliente" ON "movimientos_saldo_cliente" ("cliente_id")`);

    await q.query(`ALTER TABLE "clientes" ADD "saldo_a_favor" numeric(12,2) NOT NULL DEFAULT '0'`);
    await q.query(`CREATE TYPE "public"."ventas_estado_devolucion_enum" AS ENUM('NINGUNA', 'PARCIAL', 'TOTAL')`);
    await q.query(
      `ALTER TABLE "ventas" ADD "estado_devolucion" "public"."ventas_estado_devolucion_enum" NOT NULL DEFAULT 'NINGUNA'`,
    );
    await q.query(`ALTER TABLE "habilitaciones_facturacion_electronica" ADD "siguiente_numero_nota_credito" integer`);

    await q.query(`ALTER TABLE "documentos_electronicos" ADD "devolucion_id" character varying`);
    await q.query(`ALTER TABLE "documentos_electronicos" ADD "factura_documento_id" character varying`);
    await q.query(`ALTER TABLE "documentos_electronicos" ADD "concepto_nota_credito" character varying(1)`);
    await q.query(`CREATE INDEX "IDX_documentos_electronicos_devolucion" ON "documentos_electronicos" ("devolucion_id")`);
    await q.query(`DROP INDEX "public"."IDX_6e41418eb420375d53d20c64a5"`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_documentos_electronicos_venta_factura" ON "documentos_electronicos" ("venta_id") WHERE "tipo" <> 'NOTA_CREDITO'`,
    );
  }

  /** Postgres no puede quitar valores de un enum: se recrean los tipos sin ellos (patrón de 1790900000000). */
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "documentos_electronicos" WHERE "tipo" = 'NOTA_CREDITO'`);
    await q.query(`DROP INDEX "public"."UQ_documentos_electronicos_venta_factura"`);
    await q.query(`CREATE UNIQUE INDEX "IDX_6e41418eb420375d53d20c64a5" ON "documentos_electronicos" ("venta_id")`);
    await q.query(`DROP INDEX "public"."IDX_documentos_electronicos_devolucion"`);
    await q.query(`ALTER TABLE "documentos_electronicos" DROP COLUMN "concepto_nota_credito"`);
    await q.query(`ALTER TABLE "documentos_electronicos" DROP COLUMN "factura_documento_id"`);
    await q.query(`ALTER TABLE "documentos_electronicos" DROP COLUMN "devolucion_id"`);
    await q.query(`ALTER TABLE "habilitaciones_facturacion_electronica" DROP COLUMN "siguiente_numero_nota_credito"`);
    await q.query(`ALTER TABLE "ventas" DROP COLUMN "estado_devolucion"`);
    await q.query(`DROP TYPE "public"."ventas_estado_devolucion_enum"`);
    await q.query(`ALTER TABLE "clientes" DROP COLUMN "saldo_a_favor"`);
    await q.query(`DROP TABLE "movimientos_saldo_cliente"`);
    await q.query(`DROP TABLE "devolucion_reembolsos"`);
    await q.query(`DROP TABLE "devolucion_items"`);
    await q.query(`DROP TABLE "devoluciones"`);

    await q.query(`DELETE FROM "numeraciones_comprobante" WHERE "tipo" = 'DEVOLUCION'`);
    await this.recrearEnumSin(q, 'numeraciones_comprobante', 'tipo', 'numeraciones_comprobante_tipo_enum', 'DEVOLUCION');
    await q.query(`DELETE FROM "movimientos_inventario" WHERE "tipo" = 'BAJA_DEVOLUCION'`);
    await this.recrearEnumSin(q, 'movimientos_inventario', 'tipo', 'movimientos_inventario_tipo_enum', 'BAJA_DEVOLUCION');
    await q.query(
      `DELETE FROM "rol_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "modulo" = 'DEVOLUCIONES')`,
    );
    await q.query(`DELETE FROM "permisos" WHERE "modulo" = 'DEVOLUCIONES'`);
    await this.recrearEnumSin(q, 'permisos', 'modulo', 'permisos_modulo_enum', 'DEVOLUCIONES');
  }

  /** Lee los valores actuales del enum (para no copiar listas a mano) y lo recrea sin `quitar`. */
  private async recrearEnumSin(q: QueryRunner, tabla: string, columna: string, tipo: string, quitar: string): Promise<void> {
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
