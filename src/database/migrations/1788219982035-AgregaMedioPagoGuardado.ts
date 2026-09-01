import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaMedioPagoGuardado1788219982035 implements MigrationInterface {
    name = 'AgregaMedioPagoGuardado1788219982035'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "medios_pago_guardados" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "wompi_payment_source_id" integer NOT NULL, "ultimos_cuatro_digitos" character varying NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_36923bc95df755af3984cd31b1c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_899803fb1ee37f68b203ec1a70" ON "medios_pago_guardados"  ("negocio_id") `);
        await queryRunner.query(`ALTER TABLE "suscripciones" ADD "intentos_fallidos_cobro" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "transacciones_suscripcion" ADD "origen" character varying NOT NULL DEFAULT 'MANUAL'`);
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT '0.1'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT 0.1`);
        await queryRunner.query(`ALTER TABLE "transacciones_suscripcion" DROP COLUMN "origen"`);
        await queryRunner.query(`ALTER TABLE "suscripciones" DROP COLUMN "intentos_fallidos_cobro"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_899803fb1ee37f68b203ec1a70"`);
        await queryRunner.query(`DROP TABLE "medios_pago_guardados"`);
    }

}
