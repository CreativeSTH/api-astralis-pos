import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaFacturacionElectronica1788234555085 implements MigrationInterface {
    name = 'AgregaFacturacionElectronica1788234555085'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."documentos_electronicos_estado_enum" AS ENUM('PENDIENTE', 'ACEPTADO', 'ACEPTADO_CON_OBSERVACIONES', 'RECHAZADO', 'ERROR')`);
        await queryRunner.query(`CREATE TABLE "documentos_electronicos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "venta_id" character varying NOT NULL, "tipo" character varying NOT NULL, "estado" "public"."documentos_electronicos_estado_enum" NOT NULL DEFAULT 'PENDIENTE', "cufe" character varying, "cude" character varying, "alegra_document_id" character varying, "intentos" integer NOT NULL DEFAULT '0', "ultimo_intento_en" TIMESTAMP WITH TIME ZONE, "error_mensaje" character varying, CONSTRAINT "PK_dfc6751a1d1b4f7a5c43abfa0a7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_911d3e227a5dbd75301d85f378" ON "documentos_electronicos"  ("negocio_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6e41418eb420375d53d20c64a5" ON "documentos_electronicos"  ("venta_id") `);
        await queryRunner.query(`CREATE TYPE "public"."habilitaciones_facturacion_electronica_estado_enum" AS ENUM('DATOS_NEGOCIO', 'ESPERANDO_TRAMITE_DIAN', 'RESOLUCION_CARGADA', 'TESTSET_EN_CURSO', 'HABILITADO', 'ERROR')`);
        await queryRunner.query(`CREATE TABLE "habilitaciones_facturacion_electronica" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "negocio_id" character varying NOT NULL, "estado" "public"."habilitaciones_facturacion_electronica_estado_enum" NOT NULL DEFAULT 'DATOS_NEGOCIO', "razon_social" character varying, "direccion" character varying, "ciudad" character varying, "use_alegra_certificate" boolean NOT NULL DEFAULT true, "certificado_pfx_cifrado" character varying, "certificado_password_cifrado" character varying, "resolucion_numero" character varying, "resolucion_prefijo" character varying, "resolucion_fecha_inicio" date, "resolucion_fecha_fin" date, "resolucion_rango_desde" integer, "resolucion_rango_hasta" integer, "resolucion_technical_key" character varying, "siguiente_numero" integer, "alegra_company_id" character varying, "alegra_government_test_set_id" character varying, "ambiente" character varying NOT NULL DEFAULT 'SANDBOX', "error_mensaje" character varying, CONSTRAINT "PK_debcb422c3492cf7ef6c18779d3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b1c5c5a2a0bae3fe92b7f2ff69" ON "habilitaciones_facturacion_electronica"  ("negocio_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_b1c5c5a2a0bae3fe92b7f2ff69"`);
        await queryRunner.query(`DROP TABLE "habilitaciones_facturacion_electronica"`);
        await queryRunner.query(`DROP TYPE "public"."habilitaciones_facturacion_electronica_estado_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6e41418eb420375d53d20c64a5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_911d3e227a5dbd75301d85f378"`);
        await queryRunner.query(`DROP TABLE "documentos_electronicos"`);
        await queryRunner.query(`DROP TYPE "public"."documentos_electronicos_estado_enum"`);
    }

}
