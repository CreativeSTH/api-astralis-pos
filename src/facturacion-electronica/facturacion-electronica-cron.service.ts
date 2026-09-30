import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FacturacionElectronicaService } from './facturacion-electronica.service';
import { ContingenciaService } from './contingencia.service';

@Injectable()
export class FacturacionElectronicaCronService {
  private readonly logger = new Logger(FacturacionElectronicaCronService.name);

  constructor(
    private readonly facturacionService: FacturacionElectronicaService,
    private readonly contingencia: ContingenciaService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconciliarPendientes(): Promise<void> {
    try {
      // Primero se cierran las contingencias automáticas si Alegra ya volvió: así sus facturas de
      // papel se transmiten en este mismo ciclo.
      await this.facturacionService.verificarFinContingenciasAutomaticas();
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
      await this.contingencia.alertarPlazos();
    } catch (error) {
      this.logger.error(
        'Error alertando documentos electrónicos vencidos',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
