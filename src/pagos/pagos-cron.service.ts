import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PagosService } from './pagos.service';

/**
 * Respaldo del webhook de Wompi por polling — ver `PagosService.reconciliarPendientes` para el
 * porqué (el webhook puede simplemente no llegar: URL no configurada en Wompi, sin túnel en
 * desarrollo local, red caída, etc., y sin esto el cajero quedaría esperando para siempre sin
 * ninguna señal). Cada 10s es un intervalo corto a propósito — es una espera en vivo del cajero
 * frente al cliente, no una tarea de fondo silenciosa como `AlertasCronService` (cada 30 min); el
 * costo es bajo porque `reconciliarPendientes` solo itera transacciones realmente PENDIENTE.
 */
@Injectable()
export class PagosCronService {
  private readonly logger = new Logger(PagosCronService.name);

  constructor(private readonly pagosService: PagosService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async reconciliarPendientes(): Promise<void> {
    try {
      await this.pagosService.reconciliarPendientes();
    } catch (error) {
      this.logger.error(
        'Error reconciliando transacciones Wompi pendientes',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
