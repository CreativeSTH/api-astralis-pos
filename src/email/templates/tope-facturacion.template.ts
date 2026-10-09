import { boton, enlace, parrafo, resumen, titulo } from '../diseno/bloques';
import { fechaLarga, pesos } from '../diseno/formato';
import { correoAura } from '../diseno/layout';
import { motivoAdmin, saludo } from './comun';

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
  /** Artículo del Centro de ayuda en la landing que explica la obligación. */
  linkAyuda: string;
  nombre?: string | null;
  nombreNegocio?: string | null;
}

/** Aviso del tope de 3.500 UVT: mismo texto en el correo y en la campana (alerta TOPE_FACTURACION). */
export function construirAvisoTopeFacturacion(p: DatosAvisoTope): {
  subject: string;
  html: string;
  text: string;
  mensajeAlerta: string;
} {
  const resumenVentas = `Tus ventas registradas en AURA en ${p.anio} suman ${pesos(p.ingresos)}`;
  let subject: string;
  let mensajeAlerta: string;
  let textoBoton: string;

  if (p.nivel < 100) {
    const porcentaje = Math.floor(p.porcentaje);
    subject = `Tus ventas van en el ${porcentaje}% del tope para no facturar electrónicamente`;
    mensajeAlerta =
      `${resumenVentas}, el ${porcentaje}% del tope de 3.500 UVT (${pesos(p.tope)}). ` +
      'Si lo superas, quedas obligado a facturar electrónicamente. ' +
      'Es un mínimo: AURA no ve las ventas que hagas por fuera del sistema.';
    textoBoton = 'Ver facturación electrónica';
  } else {
    subject = 'Superaste el tope de 3.500 UVT: debes facturar electrónicamente';
    const siguientePaso = p.yaFacturaElectronica
      ? 'Como ya facturas electrónicamente en AURA, no tienes que hacer nada más.'
      : `Tienes 40 días, hasta el ${fechaLarga(p.fechaLimiteGracia ?? '')}, para activarla; después no podrás cobrar en AURA.`;
    mensajeAlerta =
      `${resumenVentas} y superaron el tope de 3.500 UVT (${pesos(p.tope)}). ` +
      `Desde hoy estás obligado a facturar electrónicamente. ${siguientePaso}`;
    textoBoton = p.yaFacturaElectronica ? 'Ver facturación electrónica' : 'Activar facturación electrónica';
  }

  const correo = correoAura({
    preheader:
      p.nivel < 100 ? `Vas en el ${Math.floor(p.porcentaje)}% del tope de 3.500 UVT.` : 'Superaste el tope de 3.500 UVT.',
    motivo: motivoAdmin(p.nombreNegocio),
    bloques: [
      titulo(p.nivel < 100 ? 'Te estás acercando al tope' : 'Ahora debes facturar electrónicamente'),
      saludo(p.nombre),
      parrafo(mensajeAlerta),
      resumen([
        [`Ventas ${p.anio} en AURA`, pesos(p.ingresos)],
        ['Tope (3.500 UVT)', pesos(p.tope)],
        ['Porcentaje', `${Math.floor(p.porcentaje)} %`],
        [
          'Fecha límite para activarla',
          p.nivel === 100 && !p.yaFacturaElectronica && p.fechaLimiteGracia ? fechaLarga(p.fechaLimiteGracia) : null,
        ],
      ]),
      boton(textoBoton, p.linkFacturacion),
      enlace('¿Por qué me pasa esto? Lee la explicación en el Centro de ayuda', p.linkAyuda),
    ],
  });
  return { subject, ...correo, mensajeAlerta };
}
