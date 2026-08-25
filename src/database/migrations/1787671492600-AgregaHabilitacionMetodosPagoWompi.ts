import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgregaHabilitacionMetodosPagoWompi1787671492600 implements MigrationInterface {
  name = 'AgregaHabilitacionMetodosPagoWompi1787671492600';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "configuraciones_pago_wompi" ADD "qrHabilitado" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuraciones_pago_wompi" ADD "nequiHabilitado" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuraciones_pago_wompi" ADD "pseHabilitado" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuraciones_pago_wompi" ADD "tarjetaHabilitado" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "configuraciones_pago_wompi" DROP COLUMN "tarjetaHabilitado"`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuraciones_pago_wompi" DROP COLUMN "pseHabilitado"`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuraciones_pago_wompi" DROP COLUMN "nequiHabilitado"`,
    );
    await queryRunner.query(
      `ALTER TABLE "configuraciones_pago_wompi" DROP COLUMN "qrHabilitado"`,
    );
  }
}
