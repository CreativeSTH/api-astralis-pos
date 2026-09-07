import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaCicloFacturacion1788642544215 implements MigrationInterface {
    name = 'AgregaCicloFacturacion1788642544215'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."suscripciones_ciclo_facturacion_enum" AS ENUM('MENSUAL', 'ANUAL')`);
        await queryRunner.query(`ALTER TABLE "suscripciones" ADD "ciclo_facturacion" "public"."suscripciones_ciclo_facturacion_enum" NOT NULL DEFAULT 'MENSUAL'`);
        await queryRunner.query(`CREATE TYPE "public"."transacciones_suscripcion_ciclo_facturacion_enum" AS ENUM('MENSUAL', 'ANUAL')`);
        await queryRunner.query(`ALTER TABLE "transacciones_suscripcion" ADD "ciclo_facturacion" "public"."transacciones_suscripcion_ciclo_facturacion_enum" NOT NULL DEFAULT 'MENSUAL'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transacciones_suscripcion" DROP COLUMN "ciclo_facturacion"`);
        await queryRunner.query(`DROP TYPE "public"."transacciones_suscripcion_ciclo_facturacion_enum"`);
        await queryRunner.query(`ALTER TABLE "suscripciones" DROP COLUMN "ciclo_facturacion"`);
        await queryRunner.query(`DROP TYPE "public"."suscripciones_ciclo_facturacion_enum"`);
    }
}
