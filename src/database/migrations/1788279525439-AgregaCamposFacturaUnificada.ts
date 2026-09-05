import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaCamposFacturaUnificada1788279525439 implements MigrationInterface {
    name = 'AgregaCamposFacturaUnificada1788279525439'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "negocios" ADD "ciudad_nombre" character varying`);
        await queryRunner.query(`ALTER TABLE "negocios" ADD "ciudad_codigo" character varying`);
        await queryRunner.query(`ALTER TABLE "negocios" ADD "departamento_codigo" character varying`);
        await queryRunner.query(`ALTER TABLE "clientes" ADD "tipo_documento_identidad" character varying`);
        await queryRunner.query(`ALTER TABLE "venta_items" ADD "base_imponible" numeric(12,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "venta_items" ADD "impuesto" numeric(12,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "documentos_electronicos" ADD "tracking_reference" jsonb`);
        await queryRunner.query(`ALTER TABLE "documentos_electronicos" ADD "errores_detalle" jsonb`);
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT '0.1'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT 0.1`);
        await queryRunner.query(`ALTER TABLE "documentos_electronicos" DROP COLUMN "errores_detalle"`);
        await queryRunner.query(`ALTER TABLE "documentos_electronicos" DROP COLUMN "tracking_reference"`);
        await queryRunner.query(`ALTER TABLE "venta_items" DROP COLUMN "impuesto"`);
        await queryRunner.query(`ALTER TABLE "venta_items" DROP COLUMN "base_imponible"`);
        await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN "tipo_documento_identidad"`);
        await queryRunner.query(`ALTER TABLE "negocios" DROP COLUMN "departamento_codigo"`);
        await queryRunner.query(`ALTER TABLE "negocios" DROP COLUMN "ciudad_codigo"`);
        await queryRunner.query(`ALTER TABLE "negocios" DROP COLUMN "ciudad_nombre"`);
    }

}
