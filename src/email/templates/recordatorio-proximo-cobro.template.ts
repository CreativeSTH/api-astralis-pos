import { boton, fuerte, parrafo, resumen, titulo } from '../diseno/bloques';
import { fechaLarga } from '../diseno/formato';
import { CorreoConstruido, correoAura } from '../diseno/layout';
import { DatosPlanCorreo, filasPlan, motivoAdmin, saludo } from './comun';

/** Día −2 / −1 (spec 2026-10-08 §5.2). Con tarjeta = renovación automática (también en prueba). */
export function construirCorreoRecordatorioProximo(d: DatosPlanCorreo & { dias: number }): CorreoConstruido {
  const cuando = d.dias === 1 ? 'mañana' : `en ${d.dias} días`;
  const fecha = fechaLarga(d.fechaFin);
  const motivo = motivoAdmin(d.nombreNegocio);

  if (d.tieneTarjeta) {
    const asunto = `Tu plan ${d.plan} se renueva ${cuando}`;
    return {
      subject: asunto,
      ...correoAura({
        preheader: `Lo cobramos automáticamente el ${fecha}. No tienes que hacer nada.`,
        motivo,
        bloques: [
          titulo(asunto),
          saludo(d.nombre),
          parrafo('No tienes que hacer nada: lo cobramos automáticamente el ', fuerte(fecha), '.'),
          resumen(filasPlan(d, 'Fecha de cobro')),
          boton('Ver mi plan', d.linkMiPlan),
        ],
      }),
    };
  }

  if (d.enPrueba) {
    const asunto = `Tu prueba gratis de AURA termina ${cuando}`;
    return {
      subject: asunto,
      ...correoAura({
        preheader: 'Elige un plan para seguir vendiendo sin interrupciones.',
        motivo,
        bloques: [
          titulo(asunto),
          saludo(d.nombre),
          parrafo('Elige un plan para seguir vendiendo sin interrupciones; tus datos se quedan como están.'),
          resumen([['Termina el', fecha]]),
          boton('Elegir mi plan', d.linkMiPlan),
        ],
      }),
    };
  }

  const asunto = `Tu acceso a AURA vence ${cuando}`;
  return {
    subject: asunto,
    ...correoAura({
      preheader: `Renueva tu plan ${d.plan} antes del ${fecha}.`,
      motivo,
      bloques: [
        titulo(asunto),
        saludo(d.nombre),
        parrafo('Renuévalo antes para seguir vendiendo sin interrupciones.'),
        resumen([
          ['Plan', d.plan],
          ['Vence el', fecha],
        ]),
        boton('Renovar mi plan', d.linkMiPlan),
      ],
    }),
  };
}
