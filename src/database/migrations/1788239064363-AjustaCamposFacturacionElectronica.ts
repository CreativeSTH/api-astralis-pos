import { MigrationInterface, QueryRunner } from "typeorm";

export class AjustaCamposFacturacionElectronica1788239064363 implements MigrationInterface {
    name = 'AjustaCamposFacturacionElectronica1788239064363'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "habilitaciones_facturacion_electronica" DROP COLUMN "alegra_government_test_set_id"`);
        await queryRunner.query(`ALTER TABLE "habilitaciones_facturacion_electronica" ADD "ciudad_codigo" character varying`);
        await queryRunner.query(`ALTER TABLE "habilitaciones_facturacion_electronica" ADD "departamento_codigo" character varying`);
        await queryRunner.query(`ALTER TABLE "habilitaciones_facturacion_electronica" ADD "government_test_set_id" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "habilitaciones_facturacion_electronica" DROP COLUMN "government_test_set_id"`);
        await queryRunner.query(`ALTER TABLE "habilitaciones_facturacion_electronica" DROP COLUMN "departamento_codigo"`);
        await queryRunner.query(`ALTER TABLE "habilitaciones_facturacion_electronica" DROP COLUMN "ciudad_codigo"`);
        await queryRunner.query(`ALTER TABLE "habilitaciones_facturacion_electronica" ADD "alegra_government_test_set_id" character varying`);
    }

}
