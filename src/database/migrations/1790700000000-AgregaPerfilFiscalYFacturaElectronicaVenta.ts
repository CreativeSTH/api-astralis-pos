import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Perfil fiscal del negocio (unificación de comprobantes, fase 1) y el valor FACTURA_ELECTRONICA
 * del comprobante de la venta. `IF NOT EXISTS` en el ADD VALUE para no fallar en bases de dev
 * donde synchronize ya lo agregó.
 */
export class AgregaPerfilFiscalYFacturaElectronicaVenta1790700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."negocios_tipo_persona_enum" AS ENUM('NATURAL', 'JURIDICA')`);
    await queryRunner.query(
      `CREATE TYPE "public"."negocios_responsabilidad_iva_enum" AS ENUM('RESPONSABLE', 'NO_RESPONSABLE', 'REGIMEN_SIMPLE')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."negocios_origen_obligacion_enum" AS ENUM('DECLARADO', 'TOPE_UVT')`);
    await queryRunner.query(`ALTER TABLE "negocios" ADD "tipo_persona" "public"."negocios_tipo_persona_enum"`);
    await queryRunner.query(`ALTER TABLE "negocios" ADD "responsabilidad_iva" "public"."negocios_responsabilidad_iva_enum"`);
    await queryRunner.query(`ALTER TABLE "negocios" ADD "perfil_fiscal_declarado_en" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "negocios" ADD "perfil_fiscal_declarado_por" character varying`);
    await queryRunner.query(`ALTER TABLE "negocios" ADD "obligado_desde" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "negocios" ADD "origen_obligacion" "public"."negocios_origen_obligacion_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."ventas_tipo_comprobante_emitido_enum" ADD VALUE IF NOT EXISTS 'FACTURA_ELECTRONICA'`,
    );
  }

  /** Postgres no puede quitar un valor de un enum: las ventas FACTURA_ELECTRONICA quedan sin tipo y se recrea el tipo. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "ventas" SET "tipo_comprobante_emitido" = NULL WHERE "tipo_comprobante_emitido" = 'FACTURA_ELECTRONICA'`,
    );
    await queryRunner.query(`CREATE TYPE "public"."ventas_tipo_comprobante_emitido_enum_old" AS ENUM('RECIBO', 'FACTURA')`);
    await queryRunner.query(
      `ALTER TABLE "ventas" ALTER COLUMN "tipo_comprobante_emitido" TYPE "public"."ventas_tipo_comprobante_emitido_enum_old" USING "tipo_comprobante_emitido"::"text"::"public"."ventas_tipo_comprobante_emitido_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."ventas_tipo_comprobante_emitido_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."ventas_tipo_comprobante_emitido_enum_old" RENAME TO "ventas_tipo_comprobante_emitido_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "negocios" DROP COLUMN "origen_obligacion"`);
    await queryRunner.query(`ALTER TABLE "negocios" DROP COLUMN "obligado_desde"`);
    await queryRunner.query(`ALTER TABLE "negocios" DROP COLUMN "perfil_fiscal_declarado_por"`);
    await queryRunner.query(`ALTER TABLE "negocios" DROP COLUMN "perfil_fiscal_declarado_en"`);
    await queryRunner.query(`ALTER TABLE "negocios" DROP COLUMN "responsabilidad_iva"`);
    await queryRunner.query(`ALTER TABLE "negocios" DROP COLUMN "tipo_persona"`);
    await queryRunner.query(`DROP TYPE "public"."negocios_origen_obligacion_enum"`);
    await queryRunner.query(`DROP TYPE "public"."negocios_responsabilidad_iva_enum"`);
    await queryRunner.query(`DROP TYPE "public"."negocios_tipo_persona_enum"`);
  }
}
