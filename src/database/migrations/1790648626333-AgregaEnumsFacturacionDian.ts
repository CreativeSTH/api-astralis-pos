import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Valores de enum que llegaron a las entities con la facturación electrónica DIAN pero nunca
 * tuvieron migración (en dev los creó `synchronize`): el tipo de alerta de habilitación vencida y
 * el módulo de permiso. Detectado corriendo todas las migraciones contra una base vacía y
 * generando el diff. `IF NOT EXISTS` para que tampoco falle en bases de dev que ya los tienen.
 *
 * Después de correrla contra una base existente: `npm run seed` — crea las filas de `permisos`
 * del módulo nuevo; sin eso responde 403 para todo el mundo (ver CLAUDE.md, "Migraciones").
 *
 * El diff automático también proponía recrear el índice único de `permisos` y cambiar el default
 * de `ventas.tasa_interes_mora` de 0.1 a '0.1' — ruido de TypeORM (un ADD VALUE no toca el índice
 * y ambos defaults son el mismo número), descartado a propósito.
 */
export class AgregaEnumsFacturacionDian1790648626333 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."alertas_tipo_enum" ADD VALUE IF NOT EXISTS 'FACTURACION_DIAN_VENCIDA'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."permisos_modulo_enum" ADD VALUE IF NOT EXISTS 'FACTURACION_ELECTRONICA_DIAN'`,
    );
  }

  /** Postgres no puede quitar un valor de un enum: se recrea el tipo sin él, borrando antes las filas que lo usan. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    // `rol_permisos` referencia `permisos` con ON DELETE CASCADE — se van también sus asignaciones a roles.
    await queryRunner.query(
      `DELETE FROM "permisos" WHERE "modulo" = 'FACTURACION_ELECTRONICA_DIAN'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."permisos_modulo_enum_old" AS ENUM('NEGOCIOS', 'SUCURSALES', 'USUARIOS', 'ROLES', 'PRODUCTOS', 'CATEGORIAS', 'MARCAS', 'LINEAS', 'PROVEEDORES', 'BODEGAS', 'INVENTARIO', 'VENTAS', 'CAJA', 'COBROS', 'CLIENTES', 'DOMICILIOS', 'ALERTAS', 'REPORTES', 'METODOS_PAGO', 'NEGOCIO', 'GRAFICOS', 'FACTURACION', 'CUPONES', 'PAGOS', 'TIENDA_ONLINE', 'PAQUETES')`,
    );
    await queryRunner.query(
      `ALTER TABLE "permisos" ALTER COLUMN "modulo" TYPE "public"."permisos_modulo_enum_old" USING "modulo"::"text"::"public"."permisos_modulo_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."permisos_modulo_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."permisos_modulo_enum_old" RENAME TO "permisos_modulo_enum"`,
    );

    await queryRunner.query(
      `DELETE FROM "alertas" WHERE "tipo" = 'FACTURACION_DIAN_VENCIDA'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."alertas_tipo_enum_old" AS ENUM('STOCK_BAJO', 'PRODUCTO_AGOTADO', 'CUOTA_POR_VENCER', 'CUOTA_VENCIDA', 'CLIENTE_LIMITE_CREDITO', 'VENTA_EN_MORA', 'META_VENTAS_NO_ALCANZADA', 'PERSONALIZADA', 'REGLA', 'SUSCRIPCION_PROXIMO_COBRO', 'SUSCRIPCION_COBRO_FALLIDO')`,
    );
    await queryRunner.query(
      `ALTER TABLE "alertas" ALTER COLUMN "tipo" TYPE "public"."alertas_tipo_enum_old" USING "tipo"::"text"::"public"."alertas_tipo_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."alertas_tipo_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."alertas_tipo_enum_old" RENAME TO "alertas_tipo_enum"`,
    );
  }
}
