import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaIndiceUnicoPaqueteFree1788151590895 implements MigrationInterface {
    name = 'AgregaIndiceUnicoPaqueteFree1788151590895'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT '0.1'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_paquetes_es_paquete_free" ON "paquetes"  ("es_paquete_free") WHERE "es_paquete_free" = true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_paquetes_es_paquete_free"`);
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT 0.1`);
    }

}
