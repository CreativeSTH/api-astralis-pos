import { boton, enlace, parrafo, resumen, titulo } from '../diseno/bloques';
import { CorreoConstruido, correoAura } from '../diseno/layout';
import { DatosPlanCorreo, filasPlan, motivoAdmin, saludo } from './comun';

/** Día 0 (spec 2026-10-08 §5.3). */
export function construirCorreoRecordatorioDia0(d: DatosPlanCorreo): CorreoConstruido {
  const motivo = motivoAdmin(d.nombreNegocio);

  if (d.tieneTarjeta) {
    const asunto = `Hoy renovamos tu plan ${d.plan}`;
    return {
      subject: asunto,
      ...correoAura({
        preheader: 'Lo cobramos automáticamente hoy. No tienes que hacer nada.',
        motivo,
        bloques: [
          titulo(asunto),
          saludo(d.nombre),
          parrafo('Hoy cobramos tu plan automáticamente. Si el cobro no pasa, te avisaremos.'),
          resumen(filasPlan(d, 'Fecha de cobro')),
          enlace('Ver mi plan', d.linkMiPlan),
        ],
      }),
    };
  }

  if (d.enPrueba) {
    const asunto = 'Tu prueba gratis de AURA termina hoy';
    return {
      subject: asunto,
      ...correoAura({
        preheader: 'Elige un plan hoy para seguir vendiendo sin interrupciones.',
        motivo,
        bloques: [
          titulo(asunto),
          saludo(d.nombre),
          parrafo('Elige un plan hoy para seguir vendiendo sin interrupciones; tus datos se quedan como están.'),
          boton('Elegir mi plan', d.linkMiPlan),
        ],
      }),
    };
  }

  const asunto = 'Tu acceso a AURA vence hoy';
  return {
    subject: asunto,
    ...correoAura({
      preheader: `Renueva tu plan ${d.plan} hoy para no perder el acceso.`,
      motivo,
      bloques: [
        titulo(asunto),
        saludo(d.nombre),
        parrafo('Renuévalo hoy para no perder el acceso al sistema.'),
        resumen([['Plan', d.plan]]),
        boton('Renovar ahora', d.linkMiPlan),
      ],
    }),
  };
}
