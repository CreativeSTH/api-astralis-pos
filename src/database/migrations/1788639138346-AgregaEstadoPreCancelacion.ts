import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaEstadoPreCancelacion1788639138346 implements MigrationInterface {
    name = 'AgregaEstadoPreCancelacion1788639138346'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."suscripciones_estado_pre_cancelacion_enum" AS ENUM('PRUEBA', 'ACTIVA', 'VENCIDA', 'CANCELADA')`);
        await queryRunner.query(`ALTER TABLE "suscripciones" ADD "estado_pre_cancelacion" "public"."suscripciones_estado_pre_cancelacion_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "suscripciones" DROP COLUMN "estado_pre_cancelacion"`);
        await queryRunner.query(`DROP TYPE "public"."suscripciones_estado_pre_cancelacion_enum"`);
    }

}
