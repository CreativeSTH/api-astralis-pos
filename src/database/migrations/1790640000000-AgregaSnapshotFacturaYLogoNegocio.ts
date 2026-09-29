import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgregaSnapshotFacturaYLogoNegocio1790640000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "documentos_electronicos"
        ADD "numero" integer,
        ADD "prefijo" character varying,
        ADD "numero_completo" character varying,
        ADD "fecha_emision" TIMESTAMP WITH TIME ZONE,
        ADD "qr_contenido" text,
        ADD "ambiente" character varying,
        ADD "resolucion_numero" character varying,
        ADD "resolucion_fecha_inicio" date,
        ADD "resolucion_fecha_fin" date,
        ADD "resolucion_rango_desde" integer,
        ADD "resolucion_rango_hasta" integer,
        ADD "emisor_razon_social" character varying,
        ADD "emisor_nit" character varying,
        ADD "emisor_direccion" character varying,
        ADD "emisor_ciudad" character varying,
        ADD "nombre_cliente" character varying,
        ADD "total" numeric(12,2)
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_documentos_electronicos_negocio_created" ON "documentos_electronicos" ("negocio_id", "created_at")`,
    );
    // Backfill del listado (spec 3.2): cliente y total salen de la venta. El resto del
    // snapshot se completa de forma perezosa consultando a Alegra (ver FacturacionElectronicaService).
    await queryRunner.query(`
      UPDATE "documentos_electronicos" d
      SET "nombre_cliente" = v."nombre_cliente", "total" = v."total"
      FROM "ventas" v
      WHERE v."id"::text = d."venta_id"
    `);
    await queryRunner.query(`ALTER TABLE "negocios" ADD "logo_url" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "negocios" DROP COLUMN "logo_url"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_documentos_electronicos_negocio_created"`);
    await queryRunner.query(`
      ALTER TABLE "documentos_electronicos"
        DROP COLUMN "total", DROP COLUMN "nombre_cliente", DROP COLUMN "emisor_ciudad",
        DROP COLUMN "emisor_direccion", DROP COLUMN "emisor_nit", DROP COLUMN "emisor_razon_social",
        DROP COLUMN "resolucion_rango_hasta", DROP COLUMN "resolucion_rango_desde",
        DROP COLUMN "resolucion_fecha_fin", DROP COLUMN "resolucion_fecha_inicio",
        DROP COLUMN "resolucion_numero", DROP COLUMN "ambiente", DROP COLUMN "qr_contenido",
        DROP COLUMN "fecha_emision", DROP COLUMN "numero_completo", DROP COLUMN "prefijo", DROP COLUMN "numero"
    `);
  }
}
