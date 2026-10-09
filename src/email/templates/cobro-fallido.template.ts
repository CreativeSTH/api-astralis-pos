import { boton, fuerte, parrafo, resumen, titulo } from '../diseno/bloques';
import { pesos } from '../diseno/formato';
import { CorreoConstruido, correoAura } from '../diseno/layout';
import { motivoAdmin, saludo } from './comun';

export interface DatosCobroFallido {
  nombre?: string | null;
  nombreNegocio?: string | null;
  plan: string;
  /** En pesos. 0 = no se muestra. */
  valor: number;
  ultimosCuatro?: string | null;
  intento: number;
  linkMiPlan: string;
  linkReactivar: string;
}

/** Spec 2026-10-08 §5.4. Al tercer intento la suscripción queda VENCIDA. */
export function construirCorreoCobroFallido(d: DatosCobroFallido): CorreoConstruido {
  const motivo = motivoAdmin(d.nombreNegocio);

  if (d.intento >= 3) {
    const asunto = 'Tu cuenta de AURA quedó en pausa';
    return {
      subject: asunto,
      ...correoAura({
        preheader: 'No pudimos cobrar después de 3 intentos. Tus datos están a salvo.',
        motivo,
        bloques: [
          titulo(asunto),
          saludo(d.nombre),
          parrafo(
            'No pudimos cobrar tu plan ',
            fuerte(d.plan),
            ' después de 3 intentos. Tus datos están a salvo: reactívala cuando quieras.',
          ),
          boton('Reactivar mi cuenta', d.linkReactivar),
        ],
      }),
    };
  }

  const asunto = `No pudimos cobrar tu plan ${d.plan}`;
  return {
    subject: asunto,
    ...correoAura({
      preheader: 'Volveremos a intentarlo mañana. Revisa tu tarjeta.',
      motivo,
      bloques: [
        titulo(asunto),
        saludo(d.nombre),
        parrafo('Volveremos a intentarlo mañana. Revisa que tenga fondos o registra otra tarjeta.'),
        resumen([
          ['Plan', d.plan],
          ['Valor', d.valor > 0 ? pesos(d.valor) : null],
          ['Tarjeta', d.ultimosCuatro ? `•••• ${d.ultimosCuatro}` : null],
          ['Intento', `${d.intento} de 3`],
        ]),
        boton('Actualizar mi tarjeta', d.linkMiPlan),
      ],
    }),
  };
}
