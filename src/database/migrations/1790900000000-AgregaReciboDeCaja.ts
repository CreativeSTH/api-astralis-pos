import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recibo de caja por abono a crédito (unificación de comprobantes, fase 4): secuencia RECIBO_CAJA y
 * foto del abono. `IF NOT EXISTS` en el ADD VALUE para no fallar en bases de dev donde synchronize
 * ya lo agregó.
 */
export class AgregaReciboDeCaja1790900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."numeraciones_comprobante_tipo_enum" ADD VALUE IF NOT EXISTS 'RECIBO_CAJA'`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_pago_cuota" ADD "numero_recibo" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_pago_cuota" ADD "sucursal_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_pago_cuota" ADD "mora_pagada" numeric(12,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_pago_cuota" ADD "saldo_venta_anterior" numeric(12,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_pago_cuota" ADD "saldo_venta_nuevo" numeric(12,2)`,
    );
  }

  /** Postgres no puede quitar un valor de un enum: se borran esas secuencias y se recrea el tipo. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "registros_pago_cuota" DROP COLUMN "saldo_venta_nuevo"`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_pago_cuota" DROP COLUMN "saldo_venta_anterior"`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_pago_cuota" DROP COLUMN "mora_pagada"`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_pago_cuota" DROP COLUMN "sucursal_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_pago_cuota" DROP COLUMN "numero_recibo"`,
    );
    await queryRunner.query(
      `DELETE FROM "numeraciones_comprobante" WHERE "tipo" = 'RECIBO_CAJA'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."numeraciones_comprobante_tipo_enum_old" AS ENUM('RECIBO', 'FACTURA')`,
    );
    await queryRunner.query(
      `ALTER TABLE "numeraciones_comprobante" ALTER COLUMN "tipo" TYPE "public"."numeraciones_comprobante_tipo_enum_old" USING "tipo"::"text"::"public"."numeraciones_comprobante_tipo_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."numeraciones_comprobante_tipo_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."numeraciones_comprobante_tipo_enum_old" RENAME TO "numeraciones_comprobante_tipo_enum"`,
    );
  }
}
