import { fuerte, nota, parrafo, resumen } from '../diseno/bloques';
import { fechaLarga, pesos } from '../diseno/formato';
import { CorreoRenderizado, correoNegocio } from '../diseno/layout';

export interface DatosCorreoFactura {
  tipo: 'FACTURA' | 'NOTA_CREDITO';
  nombreCliente: string;
  negocio: { nombre: string; logoUrl?: string | null };
  numero: string;
  fecha?: Date | string | null;
  total: number;
}

/**
 * Correo al cliente final con su factura electrónica o nota crédito; el ZIP DIAN va adjunto.
 * El asunto lo arma `asuntoCorreoFactura` (formato DIAN), no esta plantilla. Spec 2026-10-08 §5.6.
 */
export function construirCorreoFactura(d: DatosCorreoFactura): CorreoRenderizado {
  const negocio = d.negocio.nombre;
  const total = pesos(d.total);
  const fecha = d.fecha ? fechaLarga(d.fecha) : null;
  const esNota = d.tipo === 'NOTA_CREDITO';
  return correoNegocio({
    negocio: d.negocio,
    preheader: esNota
      ? `Nota crédito ${d.numero} de ${negocio} por ${total}.`
      : `Tu factura ${d.numero} de ${negocio} por ${total}.`,
    bloques: [
      parrafo(`Hola, ${d.nombreCliente.trim() || 'cliente'}.`),
      esNota
        ? parrafo(fuerte(negocio), ' te envía la nota crédito ', fuerte(d.numero), ' de tu devolución.')
        : parrafo(fuerte(negocio), ' te envía tu factura electrónica.'),
      resumen([
        ['Número', d.numero],
        ['Fecha', fecha],
        [esNota ? 'Valor devuelto' : 'Total', total],
      ]),
      esNota
        ? parrafo('En el .zip adjunto están el PDF y el XML validado por la DIAN.')
        : parrafo('En el .zip adjunto están el PDF y el XML validado por la DIAN. Guárdalos: son el soporte de tu compra.'),
      nota('Si tienes preguntas, responde este correo y le llegará a ', fuerte(negocio), '.'),
    ],
  });
}
