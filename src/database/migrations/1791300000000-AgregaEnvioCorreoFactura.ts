import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 7: registro del último envío de la factura electrónica al correo del cliente. */
export class AgregaEnvioCorreoFactura1791300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "documentos_electronicos" ADD "correo_estado" character varying, ADD "correo_destinatario" character varying, ADD "correo_enviado_en" TIMESTAMP WITH TIME ZONE, ADD "correo_error" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "documentos_electronicos" DROP COLUMN "correo_error", DROP COLUMN "correo_enviado_en", DROP COLUMN "correo_destinatario", DROP COLUMN "correo_estado"`,
    );
  }
}
