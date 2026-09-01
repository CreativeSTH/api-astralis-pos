import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaRecordatoriosSuscripcion1788227495543 implements MigrationInterface {
    name = 'AgregaRecordatoriosSuscripcion1788227495543'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "suscripciones" ADD "recordatorios_enviados" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TYPE "public"."alertas_tipo_enum" ADD VALUE 'SUSCRIPCION_PROXIMO_COBRO'`);
        await queryRunner.query(`ALTER TYPE "public"."alertas_tipo_enum" ADD VALUE 'SUSCRIPCION_COBRO_FALLIDO'`);
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT '0.1'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT 0.1`);
        await queryRunner.query(`CREATE TYPE "public"."alertas_tipo_enum_old" AS ENUM('STOCK_BAJO', 'CUOTA_POR_VENCER', 'CUOTA_VENCIDA', 'CLIENTE_LIMITE_CREDITO', 'VENTA_EN_MORA', 'PRODUCTO_AGOTADO', 'PERSONALIZADA', 'META_VENTAS_NO_ALCANZADA', 'REGLA')`);
        await queryRunner.query(`ALTER TABLE "alertas" ALTER COLUMN "tipo" TYPE "public"."alertas_tipo_enum_old" USING "tipo"::"text"::"public"."alertas_tipo_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."alertas_tipo_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."alertas_tipo_enum_old" RENAME TO "alertas_tipo_enum"`);
        await queryRunner.query(`ALTER TABLE "suscripciones" DROP COLUMN "recordatorios_enviados"`);
    }

}
