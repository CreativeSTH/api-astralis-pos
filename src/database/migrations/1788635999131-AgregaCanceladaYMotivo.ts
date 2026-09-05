import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaCanceladaYMotivo1788635999131 implements MigrationInterface {
    name = 'AgregaCanceladaYMotivo1788635999131'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "suscripciones" ADD "motivo_cancelacion" character varying`);
        await queryRunner.query(`ALTER TYPE "public"."suscripciones_estado_enum" ADD VALUE 'CANCELADA'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."suscripciones_estado_enum_old" AS ENUM('PRUEBA', 'ACTIVA', 'VENCIDA')`);
        await queryRunner.query(`ALTER TABLE "suscripciones" ALTER COLUMN "estado" TYPE "public"."suscripciones_estado_enum_old" USING "estado"::"text"::"public"."suscripciones_estado_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."suscripciones_estado_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."suscripciones_estado_enum_old" RENAME TO "suscripciones_estado_enum"`);
        await queryRunner.query(`ALTER TABLE "suscripciones" DROP COLUMN "motivo_cancelacion"`);
    }

}
