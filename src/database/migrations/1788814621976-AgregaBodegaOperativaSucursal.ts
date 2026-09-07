import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaBodegaOperativaSucursal1788814621976 implements MigrationInterface {
    name = 'AgregaBodegaOperativaSucursal1788814621976'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sucursales" ADD "bodega_operativa_id" uuid`);
        await queryRunner.query(`ALTER TABLE "sucursales" ADD CONSTRAINT "FK_b8525b784f614925a61c14a9b88" FOREIGN KEY ("bodega_operativa_id") REFERENCES "bodegas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sucursales" DROP CONSTRAINT "FK_b8525b784f614925a61c14a9b88"`);
        await queryRunner.query(`ALTER TABLE "sucursales" DROP COLUMN "bodega_operativa_id"`);
    }

}
