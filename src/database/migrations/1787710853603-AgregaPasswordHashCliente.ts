import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaPasswordHashCliente1787710853603 implements MigrationInterface {
    name = 'AgregaPasswordHashCliente1787710853603'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "clientes" ADD "password_hash" character varying`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e78ec51d8d22da3f9c1b6e0528"`);
        await queryRunner.query(`ALTER TYPE "public"."permisos_modulo_enum" ADD VALUE 'TIENDA_ONLINE'`);
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT '0.1'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e78ec51d8d22da3f9c1b6e0528" ON "permisos"  ("modulo", "accion") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_e78ec51d8d22da3f9c1b6e0528"`);
        await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "tasa_interes_mora" SET DEFAULT 0.1`);
        await queryRunner.query(`CREATE TYPE "public"."permisos_modulo_enum_old" AS ENUM('NEGOCIOS', 'SUCURSALES', 'USUARIOS', 'ROLES', 'PRODUCTOS', 'CATEGORIAS', 'MARCAS', 'LINEAS', 'PROVEEDORES', 'BODEGAS', 'INVENTARIO', 'VENTAS', 'CAJA', 'COBROS', 'CLIENTES', 'DOMICILIOS', 'ALERTAS', 'REPORTES', 'METODOS_PAGO', 'NEGOCIO', 'GRAFICOS', 'FACTURACION', 'CUPONES', 'PAGOS')`);
        await queryRunner.query(`ALTER TABLE "permisos" ALTER COLUMN "modulo" TYPE "public"."permisos_modulo_enum_old" USING "modulo"::"text"::"public"."permisos_modulo_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."permisos_modulo_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."permisos_modulo_enum_old" RENAME TO "permisos_modulo_enum"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e78ec51d8d22da3f9c1b6e0528" ON "permisos" USING btree ("modulo", "accion") `);
        await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN "password_hash"`);
    }

}
