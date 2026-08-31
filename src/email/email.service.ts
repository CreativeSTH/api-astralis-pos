import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  /**
   * `new Resend(key)` valida la key de forma síncrona y lanza si está vacía —
   * sin este guard, arrancar la app sin RESEND_API_KEY configurada (dev local,
   * CI, cualquier ambiente sin el secret todavía) tumba todo el bootstrap de
   * Nest, no solo el envío de correos. `resend` queda null en ese caso y
   * `enviar()` lo loguea y sigue — mismo criterio de "un correo que falla no
   * tumba el flujo" que ya aplica a un error de la API.
   */
  private readonly resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

  async enviar(params: { to: string; subject: string; html: string }): Promise<void> {
    if (!this.resend) {
      this.logger.error(`RESEND_API_KEY no configurada — no se envió el correo a ${params.to}`);
      return;
    }

    const { error } = await this.resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'AURA <noreply@somosaura.dev>',
      to: [params.to],
      subject: params.subject,
      html: params.html,
    });
    if (error) {
      // No se relanza como excepción HTTP: un correo que falla no debe tumbar
      // el registro de la cuenta (ya se creó) — el usuario siempre tiene
      // "reenviar verificación" como camino de recuperación.
      this.logger.error(`Error enviando correo a ${params.to}: ${JSON.stringify(error)}`);
    }
  }
}
