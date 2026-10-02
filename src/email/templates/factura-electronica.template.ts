const pesos = (valor: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);

const escapar = (texto: string) =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Correo al cliente final con su factura electrónica (el ZIP DIAN va adjunto). Cuerpo no reglamentado por la DIAN. */
export function construirCorreoFactura(p: {
  nombreCliente: string;
  nombreNegocio: string;
  numero: string;
  total: number;
}): { html: string } {
  const negocio = escapar(p.nombreNegocio);
  return {
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; max-width: 560px;">
        <p>Hola ${escapar(p.nombreCliente)},</p>
        <p><strong>${negocio}</strong> te envía tu factura electrónica <strong>${escapar(p.numero)}</strong> por <strong>${pesos(p.total)}</strong>.</p>
        <p>En el archivo .zip adjunto encuentras el PDF de la factura y el XML validado por la DIAN. Guárdalos: son el soporte de tu compra.</p>
        <p>Si tienes alguna pregunta sobre tu compra, responde este correo y le llegará a ${negocio}.</p>
        <p style="color: #6b7280; font-size: 12px;">Enviado con AURA.</p>
      </div>`,
  };
}
