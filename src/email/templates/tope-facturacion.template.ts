export interface DatosAvisoTope {
  nivel: 70 | 90 | 100;
  anio: number;
  ingresos: number;
  tope: number;
  porcentaje: number;
  yaFacturaElectronica: boolean;
  /** 'YYYY-MM-DD' — solo en el aviso de 100 sin facturación electrónica. */
  fechaLimiteGracia: string | null;
  linkFacturacion: string;
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const pesos = (valor: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(valor);

/** '2026-11-07' → '7 de noviembre de 2026' (sin Date: es un día calendario, no un instante). */
function fechaLarga(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

/** Aviso del tope de 3.500 UVT: mismo texto en el correo y en la campana (alerta TOPE_FACTURACION). */
export function construirAvisoTopeFacturacion(p: DatosAvisoTope): {
  subject: string;
  html: string;
  mensajeAlerta: string;
} {
  const resumen = `Tus ventas registradas en AURA en ${p.anio} suman ${pesos(p.ingresos)}`;
  let subject: string;
  let mensajeAlerta: string;
  let boton: string;

  if (p.nivel < 100) {
    const porcentaje = Math.floor(p.porcentaje);
    subject = `Tus ventas van en el ${porcentaje}% del tope para no facturar electrónicamente`;
    mensajeAlerta =
      `${resumen}, el ${porcentaje}% del tope de 3.500 UVT (${pesos(p.tope)}). ` +
      'Si lo superas, quedas obligado a facturar electrónicamente. ' +
      'Es un mínimo: AURA no ve las ventas que hagas por fuera del sistema.';
    boton = 'Ver facturación electrónica';
  } else {
    subject = 'Superaste el tope de 3.500 UVT: debes facturar electrónicamente';
    const siguientePaso = p.yaFacturaElectronica
      ? 'Como ya facturas electrónicamente en AURA, no tienes que hacer nada más.'
      : `Tienes 40 días, hasta el ${fechaLarga(p.fechaLimiteGracia ?? '')}, para activarla; después no podrás cobrar en AURA.`;
    mensajeAlerta =
      `${resumen} y superaron el tope de 3.500 UVT (${pesos(p.tope)}). ` +
      `Desde hoy estás obligado a facturar electrónicamente. ${siguientePaso}`;
    boton = p.yaFacturaElectronica
      ? 'Ver facturación electrónica'
      : 'Activar facturación electrónica';
  }

  const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h1>${p.nivel < 100 ? 'Te estás acercando al tope' : 'Ahora debes facturar electrónicamente'}</h1>
        <p>${mensajeAlerta}</p>
        <p>
          <a href="${p.linkFacturacion}" style="display:inline-block;padding:12px 24px;background:#6d28d9;color:#fff;text-decoration:none;border-radius:8px;">
            ${boton}
          </a>
        </p>
      </div>
    `;
  return { subject, html, mensajeAlerta };
}
