import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SuscripcionesService } from './suscripciones.service';

@Injectable()
export class SuscripcionesCronService {
  private readonly logger = new Logger(SuscripcionesCronService.name);

  constructor(private readonly suscripcionesService: SuscripcionesService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async marcarVencidas(): Promise<void> {
    try {
      await this.suscripcionesService.marcarVencidas();
    } catch (error) {
      this.logger.error('Error marcando suscripciones vencidas', error instanceof Error ? error.stack : String(error));
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async reconciliarPendientes(): Promise<void> {
    try {
      await this.suscripcionesService.reconciliarPendientes();
    } catch (error) {
      this.logger.error('Error reconciliando transacciones de suscripción pendientes', error instanceof Error ? error.stack : String(error));
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cobrarAutomatico(): Promise<void> {
    try {
      await this.suscripcionesService.cobrarAutomatico();
    } catch (error) {
      this.logger.error('Error en el cobro automático de suscripciones', error instanceof Error ? error.stack : String(error));
    }
  }

  @Cron('0 1 * * *') // 1am — antes del cron de cobro automático (2am)
  async enviarRecordatorios(): Promise<void> {
    try {
      await this.suscripcionesService.enviarRecordatorios();
    } catch (error) {
      this.logger.error('Error enviando recordatorios de pago', error instanceof Error ? error.stack : String(error));
    }
  }
}
