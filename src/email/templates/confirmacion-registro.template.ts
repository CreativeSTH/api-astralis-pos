import { boton, enlaceEnTexto, fuerte, nota, parrafo, titulo } from '../diseno/bloques';
import { CorreoConstruido, correoAura } from '../diseno/layout';
import { motivoAdmin, saludo } from './comun';

/** Verificación del correo del dueño (registro público y "reenviar verificación"). Spec 2026-10-08 §5.1. */
export function construirCorreoConfirmacion(d: {
  nombre: string;
  nombreNegocio?: string | null;
  linkVerificacion: string;
}): CorreoConstruido {
  const negocio = d.nombreNegocio?.trim();
  return {
    subject: 'Confirma tu correo para empezar en AURA',
    ...correoAura({
      preheader: 'Un clic y tu prueba gratis de 20 días queda activa.',
      motivo: motivoAdmin(negocio),
      bloques: [
        titulo('Confirma tu correo'),
        saludo(d.nombre),
        negocio
          ? parrafo(
              'Gracias por crear la cuenta de ',
              fuerte(negocio),
              ' en AURA. Confirma tu correo para activar tu prueba gratis de 20 días.',
            )
          : parrafo('Gracias por crear tu cuenta en AURA. Confirma tu correo para activar tu prueba gratis de 20 días.'),
        boton('Confirmar mi correo', d.linkVerificacion),
        nota('El enlace vence en 24 horas. Si no creaste esta cuenta, ignora este correo.'),
        enlaceEnTexto(d.linkVerificacion),
      ],
    }),
  };
}
