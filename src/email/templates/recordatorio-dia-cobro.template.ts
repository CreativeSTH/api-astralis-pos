export function construirCorreoRecordatorioDia0(
  nombrePaquete: string,
  tieneAutoDebito: boolean,
  linkReactivar: string,
  ultimosCuatroDigitos?: string,
): { subject: string; html: string } {
  if (tieneAutoDebito) {
    return {
      subject: `Hoy te cobramos tu plan ${nombrePaquete}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h1>Hoy te cobramos automáticamente</h1>
          <p>Tu plan ${nombrePaquete} se cobra hoy a tu tarjeta •••• ${ultimosCuatroDigitos}. No tenés que hacer nada.</p>
        </div>
      `,
    };
  }

  return {
    subject: `Hoy vence tu acceso a AURA — reactivá ahora`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h1>Hoy vence tu acceso</h1>
        <p>Tu plan ${nombrePaquete} vence hoy. Reactivalo para no perder acceso al sistema:</p>
        <p>
          <a href="${linkReactivar}" style="display:inline-block;padding:12px 24px;background:#6d28d9;color:#fff;text-decoration:none;border-radius:8px;">
            Reactivar ahora
          </a>
        </p>
      </div>
    `,
  };
}
