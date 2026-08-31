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
}
