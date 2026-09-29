import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TopeUvtService } from './tope-uvt.service';

@Injectable()
export class TopeUvtCronService {
  private readonly logger = new Logger(TopeUvtCronService.name);

  constructor(private readonly topeUvt: TopeUvtService) {}

  /** 3 a. m. en Colombia: con el día anterior ya cerrado y fuera de la hora de cobro de suscripciones (2 a. m.). */
  @Cron('0 3 * * *', { timeZone: 'America/Bogota' })
  async evaluar(): Promise<void> {
    try {
      await this.topeUvt.evaluarTodos();
    } catch (error) {
      this.logger.error(
        'Error evaluando el tope de 3.500 UVT',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
