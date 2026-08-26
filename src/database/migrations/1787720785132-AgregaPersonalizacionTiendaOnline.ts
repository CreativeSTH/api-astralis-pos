import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaPersonalizacionTiendaOnline1787720785132 implements MigrationInterface {
    name = 'AgregaPersonalizacionTiendaOnline1787720785132'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tiendas_online_plantilla_enum" AS ENUM('aurora', 'atelier', 'foundry', 'nocturne', 'meadow')`);
        await queryRunner.query(`ALTER TABLE "tiendas_online" ADD "plantilla" "public"."tiendas_online_plantilla_enum"`);
        await queryRunner.query(`ALTER TABLE "tiendas_online" ADD "logo_url" character varying`);
        await queryRunner.query(`ALTER TABLE "tiendas_online" ADD "banners" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "tiendas_online" ADD "terminos" text`);
        await queryRunner.query(`ALTER TABLE "tiendas_online" ADD "tratamiento_datos" text`);
        await queryRunner.query(`ALTER TABLE "tiendas_online" ADD "politica_envios" text`);
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT '0.1'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT 0.1`);
        await queryRunner.query(`ALTER TABLE "tiendas_online" DROP COLUMN "politica_envios"`);
        await queryRunner.query(`ALTER TABLE "tiendas_online" DROP COLUMN "tratamiento_datos"`);
        await queryRunner.query(`ALTER TABLE "tiendas_online" DROP COLUMN "terminos"`);
        await queryRunner.query(`ALTER TABLE "tiendas_online" DROP COLUMN "banners"`);
        await queryRunner.query(`ALTER TABLE "tiendas_online" DROP COLUMN "logo_url"`);
        await queryRunner.query(`ALTER TABLE "tiendas_online" DROP COLUMN "plantilla"`);
        await queryRunner.query(`DROP TYPE "public"."tiendas_online_plantilla_enum"`);
    }

}
