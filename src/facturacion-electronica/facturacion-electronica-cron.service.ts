import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FacturacionElectronicaService } from './facturacion-electronica.service';

@Injectable()
export class FacturacionElectronicaCronService {
  private readonly logger = new Logger(FacturacionElectronicaCronService.name);

  constructor(private readonly facturacionService: FacturacionElectronicaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconciliarPendientes(): Promise<void> {
    try {
      await this.facturacionService.reconciliarPendientes();
    } catch (error) {
      this.logger.error(
        'Error reconciliando documentos electrónicos pendientes',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async alertarDocumentosVencidos(): Promise<void> {
    try {
      await this.facturacionService.alertarDocumentosVencidos();
    } catch (error) {
      this.logger.error(
        'Error alertando documentos electrónicos vencidos',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
