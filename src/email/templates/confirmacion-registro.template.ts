export function construirCorreoConfirmacion(
  nombre: string,
  linkVerificacion: string,
): { subject: string; html: string } {
  return {
    subject: 'Confirmá tu cuenta de AURA',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h1>Hola, ${nombre}</h1>
        <p>Gracias por crear tu cuenta en AURA. Confirmá tu correo para empezar tu prueba gratuita de 20 días:</p>
        <p>
          <a href="${linkVerificacion}" style="display:inline-block;padding:12px 24px;background:#6d28d9;color:#fff;text-decoration:none;border-radius:8px;">
            Confirmar mi cuenta
          </a>
        </p>
        <p>Si el botón no funciona, copiá y pegá este link en tu navegador:</p>
        <p>${linkVerificacion}</p>
        <p>Este link expira en 24 horas.</p>
      </div>
    `,
  };
}
