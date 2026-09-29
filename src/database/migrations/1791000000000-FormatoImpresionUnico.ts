import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un solo formato de impresión por negocio (unificación de comprobantes, fase 5b): el mensaje de
 * cierre y los términos pasan al negocio (el logo es el del negocio; si solo lo tenía la plantilla,
 * se copia), y se borran las plantillas y las columnas que las asignaban. El `down` recrea las
 * estructuras vacías: los datos de plantillas no se restauran.
 */
export class FormatoImpresionUnico1791000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "negocios" ADD "mensaje_cierre_comprobante" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "negocios" ADD "terminos_comprobante" text`,
    );
    // Una plantilla por negocio: la de recibo predeterminada, si no la predeterminada que haya, si no el recibo más reciente.
    await queryRunner.query(`
      UPDATE "negocios" n SET
        "mensaje_cierre_comprobante" = NULLIF(TRIM(p."configuracion"->>'mensajeCierre'), ''),
        "terminos_comprobante" = NULLIF(TRIM(p."configuracion"->>'terminos'), ''),
        "logo_url" = COALESCE(n."logo_url", p."logo_url")
      FROM (
        SELECT DISTINCT ON ("negocio_id") "negocio_id", "configuracion", "logo_url"
        FROM "plantillas_comprobante"
        WHERE "activo"
        ORDER BY "negocio_id", ("tipo" = 'RECIBO' AND "es_predeterminada") DESC, "es_predeterminada" DESC,
          ("tipo" = 'RECIBO') DESC, "updated_at" DESC
      ) p
      WHERE n."id"::text = p."negocio_id"
    `);
    await queryRunner.query(
      `ALTER TABLE "ventas" DROP COLUMN "plantilla_comprobante_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sucursales" DROP COLUMN "plantilla_factura_defecto_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sucursales" DROP COLUMN "plantilla_recibo_defecto_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sucursales" DROP COLUMN "tipo_comprobante_defecto"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."sucursales_tipo_comprobante_defecto_enum"`,
    );
    await queryRunner.query(`DROP TABLE "plantillas_comprobante"`);
    await queryRunner.query(
      `DROP TYPE "public"."plantillas_comprobante_tipo_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."plantillas_comprobante_tipo_enum" AS ENUM('RECIBO', 'FACTURA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "plantillas_comprobante" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "tipo" "public"."plantillas_comprobante_tipo_enum" NOT NULL, "nombre" character varying NOT NULL, "es_predeterminada" boolean NOT NULL DEFAULT false, "logo_url" character varying, "configuracion" jsonb NOT NULL DEFAULT '{}', "activo" boolean NOT NULL DEFAULT true, "creado_por" character varying, CONSTRAINT "PK_eaee92fd22c5b4f472e6a6aab26" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_267522fda239f036a2ce469ae7" ON "plantillas_comprobante" ("negocio_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sucursales_tipo_comprobante_defecto_enum" AS ENUM('RECIBO', 'FACTURA')`,
    );
    await queryRunner.query(
      `ALTER TABLE "sucursales" ADD "tipo_comprobante_defecto" "public"."sucursales_tipo_comprobante_defecto_enum" NOT NULL DEFAULT 'RECIBO'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sucursales" ADD "plantilla_recibo_defecto_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "sucursales" ADD "plantilla_factura_defecto_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD "plantilla_comprobante_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "negocios" DROP COLUMN "terminos_comprobante"`,
    );
    await queryRunner.query(
      `ALTER TABLE "negocios" DROP COLUMN "mensaje_cierre_comprobante"`,
    );
  }
}
