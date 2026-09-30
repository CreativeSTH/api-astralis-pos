import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contingencia de facturación (unificación de comprobantes, fase 6a): períodos, resolución de
 * contingencia en la habilitación y marca de contingencia en cada documento. `IF NOT EXISTS` en el
 * ADD VALUE para no fallar en bases de dev donde synchronize ya lo agregó.
 */
export class AgregaContingenciaFacturacion1791100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."alertas_tipo_enum" ADD VALUE IF NOT EXISTS 'CONTINGENCIA_FACTURACION'`);
    await queryRunner.query(
      `CREATE TABLE "periodos_contingencia" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "inicio" TIMESTAMP WITH TIME ZONE NOT NULL, "fin" TIMESTAMP WITH TIME ZONE, "origen" character varying NOT NULL, "motivo" character varying NOT NULL, "declarado_por" character varying, "finalizado_por" character varying, "aviso_inicio_en" TIMESTAMP WITH TIME ZONE, "aviso_fin_en" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_periodos_contingencia" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_periodos_contingencia_negocio_inicio" ON "periodos_contingencia" ("negocio_id", "inicio")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_periodos_contingencia_abierto" ON "periodos_contingencia" ("negocio_id") WHERE "fin" IS NULL`,
    );
    for (const columna of [
      `"contingencia_resolucion_numero" character varying`,
      `"contingencia_prefijo" character varying`,
      `"contingencia_fecha_inicio" date`,
      `"contingencia_fecha_fin" date`,
      `"contingencia_rango_desde" integer`,
      `"contingencia_rango_hasta" integer`,
      `"contingencia_siguiente_numero" integer`,
      `"alegra_no_disponible_desde" TIMESTAMP WITH TIME ZONE`,
    ]) {
      await queryRunner.query(`ALTER TABLE "habilitaciones_facturacion_electronica" ADD ${columna}`);
    }
    await queryRunner.query(`ALTER TABLE "documentos_electronicos" ADD "periodo_contingencia_id" character varying`);
    await queryRunner.query(
      `ALTER TABLE "documentos_electronicos" ADD "transcrita_de_talonario" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_documentos_electronicos_periodo_contingencia" ON "documentos_electronicos" ("periodo_contingencia_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_documentos_electronicos_contingencia_numero" ON "documentos_electronicos" ("negocio_id", "prefijo", "numero") WHERE "periodo_contingencia_id" IS NOT NULL`,
    );
  }

  /** El valor del enum de alertas queda (Postgres no quita valores de un enum sin recrear el tipo). */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_documentos_electronicos_contingencia_numero"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_documentos_electronicos_periodo_contingencia"`);
    await queryRunner.query(`ALTER TABLE "documentos_electronicos" DROP COLUMN "transcrita_de_talonario"`);
    await queryRunner.query(`ALTER TABLE "documentos_electronicos" DROP COLUMN "periodo_contingencia_id"`);
    for (const columna of [
      'alegra_no_disponible_desde',
      'contingencia_siguiente_numero',
      'contingencia_rango_hasta',
      'contingencia_rango_desde',
      'contingencia_fecha_fin',
      'contingencia_fecha_inicio',
      'contingencia_prefijo',
      'contingencia_resolucion_numero',
    ]) {
      await queryRunner.query(`ALTER TABLE "habilitaciones_facturacion_electronica" DROP COLUMN "${columna}"`);
    }
    await queryRunner.query(`DROP TABLE "periodos_contingencia"`);
  }
}
