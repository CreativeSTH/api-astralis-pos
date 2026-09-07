import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgregaEsHabilitacionDePrueba1788753182889 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "habilitaciones_facturacion_electronica" ADD "es_habilitacion_de_prueba" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "habilitaciones_facturacion_electronica" DROP COLUMN "es_habilitacion_de_prueba"`,
    );
  }
}
