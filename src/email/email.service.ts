import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend = new Resend(process.env.RESEND_API_KEY);

  async enviar(params: { to: string; subject: string; html: string }): Promise<void> {
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
