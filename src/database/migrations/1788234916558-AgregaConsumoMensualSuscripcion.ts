import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaConsumoMensualSuscripcion1788234916558 implements MigrationInterface {
    name = 'AgregaConsumoMensualSuscripcion1788234916558'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "suscripciones" ADD "consumo_mensual" jsonb NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "suscripciones" ADD "consumo_mes_referencia" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "suscripciones" DROP COLUMN "consumo_mes_referencia"`);
        await queryRunner.query(`ALTER TABLE "suscripciones" DROP COLUMN "consumo_mensual"`);
    }

}
