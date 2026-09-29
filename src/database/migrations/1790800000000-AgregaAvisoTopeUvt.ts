import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tope de 3.500 UVT (unificación de comprobantes, fase 3): último aviso enviado por negocio y el
 * tipo de alerta TOPE_FACTURACION. `IF NOT EXISTS` en el ADD VALUE para no fallar en bases de dev
 * donde synchronize ya lo agregó.
 */
export class AgregaAvisoTopeUvt1790800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "negocios" ADD "aviso_tope_uvt_nivel" smallint`,
    );
    await queryRunner.query(
      `ALTER TABLE "negocios" ADD "aviso_tope_uvt_anio" smallint`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."alertas_tipo_enum" ADD VALUE IF NOT EXISTS 'TOPE_FACTURACION'`,
    );
  }

  /** Postgres no puede quitar un valor de un enum: se borran esas alertas y se recrea el tipo. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "alertas" WHERE "tipo" = 'TOPE_FACTURACION'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."alertas_tipo_enum_old" AS ENUM('STOCK_BAJO', 'PRODUCTO_AGOTADO', 'CUOTA_POR_VENCER', 'CUOTA_VENCIDA', 'CLIENTE_LIMITE_CREDITO', 'VENTA_EN_MORA', 'META_VENTAS_NO_ALCANZADA', 'PERSONALIZADA', 'REGLA', 'SUSCRIPCION_PROXIMO_COBRO', 'SUSCRIPCION_COBRO_FALLIDO', 'FACTURACION_DIAN_VENCIDA')`,
    );
    await queryRunner.query(
      `ALTER TABLE "alertas" ALTER COLUMN "tipo" TYPE "public"."alertas_tipo_enum_old" USING "tipo"::"text"::"public"."alertas_tipo_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."alertas_tipo_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."alertas_tipo_enum_old" RENAME TO "alertas_tipo_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "negocios" DROP COLUMN "aviso_tope_uvt_anio"`,
    );
    await queryRunner.query(
      `ALTER TABLE "negocios" DROP COLUMN "aviso_tope_uvt_nivel"`,
    );
  }
}
