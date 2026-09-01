export function construirCorreoCobroFallido(
  nombrePaquete: string,
  intento: number,
  linkReactivar: string,
): { subject: string; html: string } {
  const esUltimoIntento = intento >= 3;
  const cuerpo = esUltimoIntento
    ? `Este era el último intento y no se pudo cobrar — tu cuenta quedó bloqueada. Reactivala con otra tarjeta o el mismo método:`
    : `No pudimos cobrar tu tarjeta para el plan ${nombrePaquete}. Vamos a reintentar mañana — revisá que tenga fondos o esté vigente. Si preferís, actualizá tu medio de pago ahora:`;

  return {
    subject: esUltimoIntento ? 'Tu cuenta quedó bloqueada — no pudimos cobrarte' : 'No pudimos cobrar tu tarjeta',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h1>${esUltimoIntento ? 'Cuenta bloqueada' : 'Cobro fallido'}</h1>
        <p>${cuerpo}</p>
        <p>
          <a href="${linkReactivar}" style="display:inline-block;padding:12px 24px;background:#6d28d9;color:#fff;text-decoration:none;border-radius:8px;">
            ${esUltimoIntento ? 'Reactivar cuenta' : 'Actualizar tarjeta'}
          </a>
        </p>
      </div>
    `,
  };
}
