import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import { AlertasService } from './alertas.service';
import { NegociosService } from '../negocios/negocios.service';

/**
 * `AlertasService.generar()` lee `negocioId` del contexto CLS, poblado
 * normalmente por `TenantGuard` a partir del JWT de una request HTTP real —
 * un cron no tiene request, así que cada negocio se recorre en su propio
 * contexto CLS aislado (`runWith`) para no mezclar datos entre negocios.
 */
@Injectable()
export class AlertasCronService {
  private readonly logger = new Logger(AlertasCronService.name);

  constructor(
    private readonly alertasService: AlertasService,
    private readonly negociosService: NegociosService,
    private readonly cls: ClsService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async regenerarAlertas(): Promise<void> {
    const negocios = await this.negociosService.findAll();
    for (const negocio of negocios) {
      try {
        await this.cls.runWith({ negocioId: negocio.id } as never, () =>
          this.alertasService.generar(),
        );
      } catch (error) {
        this.logger.error(
          `Error generando alertas para el negocio ${negocio.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
