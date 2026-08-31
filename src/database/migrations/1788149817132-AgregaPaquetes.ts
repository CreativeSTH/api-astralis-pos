import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaPaquetes1788149817132 implements MigrationInterface {
    name = 'AgregaPaquetes1788149817132'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "paquetes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "nombre" character varying NOT NULL, "descripcion" character varying, "precio_mensual" numeric(12,2) NOT NULL, "facturacion_dian_habilitada" boolean NOT NULL DEFAULT false, "documentos_dian_por_mes" integer NOT NULL DEFAULT '0', "tienda_online_habilitada" boolean NOT NULL DEFAULT false, "max_sucursales" integer NOT NULL DEFAULT '0', "max_usuarios" integer NOT NULL DEFAULT '0', "es_paquete_free" boolean NOT NULL DEFAULT false, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_320a0c4f75ec47ec218c5024e63" PRIMARY KEY ("id"))`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e78ec51d8d22da3f9c1b6e0528"`);
        await queryRunner.query(`ALTER TYPE "public"."permisos_modulo_enum" ADD VALUE 'PAQUETES'`);
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT '0.1'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e78ec51d8d22da3f9c1b6e0528" ON "permisos"  ("modulo", "accion") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_e78ec51d8d22da3f9c1b6e0528"`);
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT 0.1`);
        await queryRunner.query(`CREATE TYPE "public"."permisos_modulo_enum_old" AS ENUM('NEGOCIOS', 'SUCURSALES', 'USUARIOS', 'ROLES', 'PRODUCTOS', 'CATEGORIAS', 'MARCAS', 'LINEAS', 'BODEGAS', 'INVENTARIO', 'VENTAS', 'CAJA', 'COBROS', 'CLIENTES', 'ALERTAS', 'REPORTES', 'PROVEEDORES', 'DOMICILIOS', 'METODOS_PAGO', 'GRAFICOS', 'FACTURACION', 'NEGOCIO', 'CUPONES', 'PAGOS', 'TIENDA_ONLINE')`);
        await queryRunner.query(`ALTER TABLE "permisos" ALTER COLUMN "modulo" TYPE "public"."permisos_modulo_enum_old" USING "modulo"::"text"::"public"."permisos_modulo_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."permisos_modulo_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."permisos_modulo_enum_old" RENAME TO "permisos_modulo_enum"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e78ec51d8d22da3f9c1b6e0528" ON "permisos" USING btree ("modulo", "accion") `);
        await queryRunner.query(`DROP TABLE "paquetes"`);
    }

}
