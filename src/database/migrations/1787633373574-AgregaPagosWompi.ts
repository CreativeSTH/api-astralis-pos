import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgregaPagosWompi1787633373574 implements MigrationInterface {
  name = 'AgregaPagosWompi1787633373574';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "configuraciones_pago_wompi" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "negocioId" character varying NOT NULL, "llavePublica" character varying, "llavePrivadaCifrada" character varying, "llaveSecretaEventosCifrada" character varying, "activo" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_99bef7918bb9d72b6858d1cb9e3" UNIQUE ("negocioId"), CONSTRAINT "PK_dae0d289a03e4c37bc1116d3b9e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "transacciones_pago" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "negocioId" character varying NOT NULL, "referencia" character varying NOT NULL, "wompiTransactionId" character varying, "metodoPago" character varying NOT NULL, "estado" character varying NOT NULL DEFAULT 'PENDIENTE', "montoEnCentavos" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "confirmedAt" TIMESTAMP, CONSTRAINT "PK_23039e451a20cc37dbf6fd50f62" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_45aa914a60a7d63bb4e809eeae" ON "transacciones_pago"  ("negocioId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6699f855cecccfc8a8e6b193d3" ON "transacciones_pago"  ("referencia") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6699f855cecccfc8a8e6b193d3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_45aa914a60a7d63bb4e809eeae"`,
    );
    await queryRunner.query(`DROP TABLE "transacciones_pago"`);
    await queryRunner.query(`DROP TABLE "configuraciones_pago_wompi"`);
  }
}
