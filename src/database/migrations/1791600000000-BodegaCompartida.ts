import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bodega compartida entre sucursales y CEDI (spec 2026-10-04): `bodegas.sucursal_id` pasa a la
 * tabla N:M `sucursal_bodegas`. Cada bodega queda asociada a la sucursal que ya tenía, así que
 * nada cambia para los negocios existentes. Nombres de índices/constraints = los que genera
 * TypeORM para `Bodega.sucursales`, para que `synchronize` en dev no vea diferencias.
 */
export class BodegaCompartida1791600000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "sucursal_bodegas" ("bodega_id" uuid NOT NULL, "sucursal_id" uuid NOT NULL, CONSTRAINT "PK_ba0586b34eead0c757cb87c5386" PRIMARY KEY ("bodega_id", "sucursal_id"))`,
    );
    await q.query(`CREATE INDEX "IDX_11a9d3205667f68c02dcf9259f" ON "sucursal_bodegas" ("bodega_id")`);
    await q.query(`CREATE INDEX "IDX_a793f5cd3b2df926099fb02d45" ON "sucursal_bodegas" ("sucursal_id")`);
    await q.query(
      `ALTER TABLE "sucursal_bodegas" ADD CONSTRAINT "FK_11a9d3205667f68c02dcf9259f0" FOREIGN KEY ("bodega_id") REFERENCES "bodegas"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `ALTER TABLE "sucursal_bodegas" ADD CONSTRAINT "FK_a793f5cd3b2df926099fb02d452" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `INSERT INTO "sucursal_bodegas" ("bodega_id", "sucursal_id") SELECT "id", "sucursal_id" FROM "bodegas"`,
    );
    await q.query(`ALTER TABLE "bodegas" DROP CONSTRAINT "FK_f90b6577f4962bcce027b156a98"`);
    await q.query(`ALTER TABLE "bodegas" DROP COLUMN "sucursal_id"`);
  }

  public async down(q: QueryRunner): Promise<void> {
    const cedis: { nombre: string }[] = await q.query(
      `SELECT b."nombre" FROM "bodegas" b WHERE NOT EXISTS (SELECT 1 FROM "sucursal_bodegas" sb WHERE sb."bodega_id" = b."id")`,
    );
    if (cedis.length > 0) {
      throw new Error(
        `No se puede revertir: hay bodegas sin sucursal (CEDI): ${cedis.map((c) => c.nombre).join(', ')}. Asócialas a una sucursal primero.`,
      );
    }
    await q.query(`ALTER TABLE "bodegas" ADD "sucursal_id" uuid`);
    // Una bodega compartida vuelve con una sola de sus sucursales (la de id menor): el modelo viejo no admite más.
    await q.query(
      `UPDATE "bodegas" b SET "sucursal_id" = (SELECT MIN(sb."sucursal_id"::text)::uuid FROM "sucursal_bodegas" sb WHERE sb."bodega_id" = b."id")`,
    );
    await q.query(`ALTER TABLE "bodegas" ALTER COLUMN "sucursal_id" SET NOT NULL`);
    await q.query(
      `ALTER TABLE "bodegas" ADD CONSTRAINT "FK_f90b6577f4962bcce027b156a98" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await q.query(`DROP TABLE "sucursal_bodegas"`);
  }
}
