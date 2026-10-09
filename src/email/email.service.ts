import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

export type ResultadoEnvioCorreo = { ok: true } | { ok: false; error: string };

/** 'AURA <noreply@x.dev>' → 'noreply@x.dev'; si no hay `<>` el valor ya es la dirección. */
function direccionDe(from: string): string {
  return from.match(/<([^>]+)>/)?.[1] ?? from.trim();
}

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

  async enviar(params: {
    to: string;
    subject: string;
    html: string;
    /** Versión en texto plano (la arman las plantillas). */
    text?: string;
    /** Nombre visible del remitente (p. ej. el negocio); la dirección sigue siendo la de AURA. */
    nombreRemitente?: string;
    replyTo?: string;
    adjuntos?: { filename: string; content: Buffer; contentType?: string }[];
  }): Promise<ResultadoEnvioCorreo> {
    if (!this.resend) {
      this.logger.error(`RESEND_API_KEY no configurada — no se envió el correo a ${params.to}`);
      return { ok: false, error: 'RESEND_API_KEY no configurada' };
    }

    const fromConfigurado = process.env.RESEND_FROM_EMAIL ?? 'AURA <noreply@somosaura.dev>';
    const from = params.nombreRemitente
      ? `${params.nombreRemitente.replace(/["<>]/g, '')} vía AURA <${direccionDe(fromConfigurado)}>`
      : fromConfigurado;

    const { error } = await this.resend.emails.send({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      ...(params.adjuntos?.length ? { attachments: params.adjuntos } : {}),
    });
    if (error) {
      // No se relanza como excepción HTTP: un correo que falla no debe tumbar
      // el registro de la cuenta (ya se creó) — el usuario siempre tiene
      // "reenviar verificación" como camino de recuperación.
      this.logger.error(`Error enviando correo a ${params.to}: ${JSON.stringify(error)}`);
      return { ok: false, error: error.message ?? JSON.stringify(error) };
    }
    return { ok: true };
  }
}
