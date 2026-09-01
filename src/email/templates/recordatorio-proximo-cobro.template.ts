export function construirCorreoRecordatorioProximo(
  nombrePaquete: string,
  dias: number,
  tieneAutoDebito: boolean,
  ultimosCuatroDigitos?: string,
): { subject: string; html: string } {
  const cuando = dias === 1 ? 'mañana' : `en ${dias} días`;
  const accion = tieneAutoDebito
    ? `se cobrará automático a tu tarjeta •••• ${ultimosCuatroDigitos}`
    : 'recordá reactivar manualmente antes de esa fecha o vas a perder acceso al sistema';

  return {
    subject: `Tu plan ${nombrePaquete} se cobra ${cuando}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h1>Tu plan ${nombrePaquete} se cobra ${cuando}</h1>
        <p>${accion.charAt(0).toUpperCase()}${accion.slice(1)}.</p>
      </div>
    `,
  };
}
