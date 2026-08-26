import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaTiendaOnline1787707565164 implements MigrationInterface {
    name = 'AgregaTiendaOnline1787707565164'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tiendas_online" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "bodega_id" uuid, "activo" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_58063f2ac33bb3dee87ae6386a5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8564904284072dac78cacff32d" ON "tiendas_online"  ("negocio_id") `);
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT '0.1'`);
        await queryRunner.query(`ALTER TABLE "tiendas_online" ADD CONSTRAINT "FK_f999e1925597803679af83190fc" FOREIGN KEY ("bodega_id") REFERENCES "bodegas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tiendas_online" DROP CONSTRAINT "FK_f999e1925597803679af83190fc"`);
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT 0.1`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8564904284072dac78cacff32d"`);
        await queryRunner.query(`DROP TABLE "tiendas_online"`);
    }

}
