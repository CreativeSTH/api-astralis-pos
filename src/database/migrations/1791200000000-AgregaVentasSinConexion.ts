import { MigrationInterface, QueryRunner } from 'typeorm';

/** Vender sin internet (unificación de comprobantes, fase 6b): reservas de numeración, episodios y ventas sin conexión. */
export class AgregaVentasSinConexion1791200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "reservas_contingencia" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "terminal_id" character varying NOT NULL, "desde" integer NOT NULL, "hasta" integer NOT NULL, "resolucion_numero" character varying NOT NULL, "prefijo" character varying NOT NULL, "fecha_inicio" date NOT NULL, "fecha_fin" date NOT NULL, "rango_desde" integer NOT NULL, "rango_hasta" integer NOT NULL, CONSTRAINT "PK_reservas_contingencia" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reservas_contingencia_negocio_terminal" ON "reservas_contingencia" ("negocio_id", "terminal_id")`,
    );
    await queryRunner.query(`ALTER TABLE "periodos_contingencia" ADD "episodio_id" character varying`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_periodos_contingencia_episodio" ON "periodos_contingencia" ("episodio_id") WHERE "episodio_id" IS NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "ventas" ADD "id_local" character varying`);
    await queryRunner.query(`ALTER TABLE "ventas" ADD "vendida_sin_conexion" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "ventas" ADD "numero_sin_conexion" character varying`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ventas_negocio_id_local" ON "ventas" ("negocio_id", "id_local") WHERE "id_local" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_ventas_negocio_id_local"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN "numero_sin_conexion"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN "vendida_sin_conexion"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN "id_local"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_periodos_contingencia_episodio"`);
    await queryRunner.query(`ALTER TABLE "periodos_contingencia" DROP COLUMN "episodio_id"`);
    await queryRunner.query(`DROP TABLE "reservas_contingencia"`);
  }
}
