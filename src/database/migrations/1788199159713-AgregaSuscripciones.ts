import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaSuscripciones1788199159713 implements MigrationInterface {
    name = 'AgregaSuscripciones1788199159713'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."suscripciones_estado_enum" AS ENUM('PRUEBA', 'ACTIVA', 'VENCIDA')`);
        await queryRunner.query(`CREATE TABLE "suscripciones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "paquete_id" uuid NOT NULL, "estado" "public"."suscripciones_estado_enum" NOT NULL, "fecha_inicio" TIMESTAMP WITH TIME ZONE NOT NULL, "fecha_fin" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_bdaed0a0504c9786d45b786a68a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_27459890bfcb36815e4073a87f" ON "suscripciones"  ("negocio_id") `);
        await queryRunner.query(`CREATE TABLE "transacciones_suscripcion" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "paquete_id" character varying NOT NULL, "referencia" character varying NOT NULL, "wompi_transaction_id" character varying, "metodo_pago" character varying NOT NULL, "estado" character varying NOT NULL DEFAULT 'PENDIENTE', "monto_en_centavos" integer NOT NULL, "confirmed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_2a242247d646ab108297f861afd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_537dcc5a8e074a6a15bd108389" ON "transacciones_suscripcion"  ("negocio_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_979f6c43f3d3954e0f9b22e1ff" ON "transacciones_suscripcion"  ("referencia") `);
        await queryRunner.query(`ALTER TABLE "usuarios" ADD "email_verificado" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "usuarios" ADD "token_verificacion" character varying`);
        await queryRunner.query(`ALTER TABLE "usuarios" ADD "token_verificacion_expira" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT '0.1'`);
        await queryRunner.query(`ALTER TABLE "suscripciones" ADD CONSTRAINT "FK_41fdfb2a6c728a6569ea5aeca64" FOREIGN KEY ("paquete_id") REFERENCES "paquetes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        // Idempotente por si la pieza 1 (Paquetes) todavía no sembró el FREE en este ambiente.
        await queryRunner.query(`
          INSERT INTO "paquetes"
            ("id", "nombre", "descripcion", "precio_mensual", "facturacion_dian_habilitada",
             "documentos_dian_por_mes", "tienda_online_habilitada", "max_sucursales", "max_usuarios",
             "es_paquete_free", "activo")
          SELECT uuid_generate_v4(), 'Free', 'Paquete de respaldo sin costo — sin acceso a features premium',
                 0, false, 0, false, 0, 0, true, true
          WHERE NOT EXISTS (SELECT 1 FROM "paquetes" WHERE "es_paquete_free" = true)
        `);

        await queryRunner.query(`
          INSERT INTO "suscripciones" ("id", "negocio_id", "paquete_id", "estado", "fecha_inicio", "fecha_fin")
          SELECT
            uuid_generate_v4(),
            n."id",
            (SELECT "id" FROM "paquetes" WHERE "es_paquete_free" = true LIMIT 1),
            'ACTIVA',
            now(),
            NULL
          FROM "negocios" n
          WHERE NOT EXISTS (SELECT 1 FROM "suscripciones" s WHERE s."negocio_id" = n."id"::text)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "suscripciones" DROP CONSTRAINT "FK_41fdfb2a6c728a6569ea5aeca64"`);
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT 0.1`);
        await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN "token_verificacion_expira"`);
        await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN "token_verificacion"`);
        await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN "email_verificado"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_979f6c43f3d3954e0f9b22e1ff"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_537dcc5a8e074a6a15bd108389"`);
        await queryRunner.query(`DROP TABLE "transacciones_suscripcion"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_27459890bfcb36815e4073a87f"`);
        await queryRunner.query(`DROP TABLE "suscripciones"`);
        await queryRunner.query(`DROP TYPE "public"."suscripciones_estado_enum"`);
    }

}
