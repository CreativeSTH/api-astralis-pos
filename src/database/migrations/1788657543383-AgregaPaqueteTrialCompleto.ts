import { MigrationInterface, QueryRunner } from "typeorm";

export class AgregaPaqueteTrialCompleto1788657543383 implements MigrationInterface {
    name = 'AgregaPaqueteTrialCompleto1788657543383'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "paquetes" ADD "es_paquete_trial_completo" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_paquetes_es_paquete_trial_completo" ON "paquetes" ("es_paquete_trial_completo") WHERE "es_paquete_trial_completo" = true`);
        // Backfill: marca el paquete más completo del catálogo ACTUAL como el del trial.
        // Asunción explícita, documentada acá porque no hay forma de derivarla del esquema:
        // "POS Empresarial" es hoy el único paquete con todas las features (DIAN + tienda
        // online) y los límites más altos — si el catálogo cambia en el futuro, un admin lo
        // reasigna a mano desde /paquetes (ver PaquetesService.update), esta migración no
        // vuelve a correr.
        await queryRunner.query(`UPDATE "paquetes" SET "es_paquete_trial_completo" = true WHERE "nombre" = 'POS Empresarial'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_paquetes_es_paquete_trial_completo"`);
        await queryRunner.query(`ALTER TABLE "paquetes" DROP COLUMN "es_paquete_trial_completo"`);
    }
}
