import { MARCA } from './marca';
import { Bloque, escapar } from './bloques';

export interface CorreoRenderizado {
  html: string;
  text: string;
}

export interface CorreoConstruido extends CorreoRenderizado {
  subject: string;
}

const PIE_AURA = 'AURA · Sistema POS para tu negocio · somosaura.com.co';
const PIE_NEGOCIO = 'Enviado con AURA · somosaura.com.co';

/** Logo guardado como `/uploads/...` → URL que un cliente de correo puede descargar. Sin `BACKEND_PUBLIC_URL`, null. */
export function urlPublicaLogo(logoUrl?: string | null): string | null {
  if (!logoUrl) return null;
  if (/^https?:\/\//i.test(logoUrl)) return logoUrl;
  const base = process.env.BACKEND_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
}

const fuente = (tamano: number, alto: number, color: string) =>
  `font-family:${MARCA.fuente};font-size:${tamano}px;line-height:${alto}px;color:${color};`;

/** Esqueleto común: tablas y estilos en línea (lo único que respeta Outlook), modo claro, preheader oculto. */
function documento(p: {
  preheader: string;
  acentoSolido: string;
  acentoFondo: string;
  encabezado: string;
  cuerpo: string;
  pie: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title></title>
</head>
<body style="margin:0;padding:0;background:${MARCA.fondoPagina};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapar(p.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${MARCA.fondoPagina}" style="background:${MARCA.fondoPagina};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${MARCA.anchoMax}px;">
<tr><td bgcolor="${p.acentoSolido}" style="height:4px;line-height:4px;font-size:0;border-radius:16px 16px 0 0;${p.acentoFondo}">&nbsp;</td></tr>
<tr><td bgcolor="${MARCA.tarjeta}" style="background:${MARCA.tarjeta};border:1px solid ${MARCA.borde};border-top:0;border-radius:0 0 16px 16px;padding:28px 32px 12px;">
${p.encabezado}
${p.cuerpo}
</td></tr>
<tr><td align="center" style="padding:20px 8px 0;${fuente(13, 20, MARCA.textoSuave)}">${p.pie}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const textoPlano = (encabezado: string, bloques: Bloque[], pie: string[]) =>
  [encabezado, ...bloques.map((b) => b.texto).filter((t) => t.trim() !== ''), '—', ...pie].join('\n\n');

/** Los 5 correos de AURA al dueño del negocio. */
export function correoAura(p: { preheader: string; bloques: Bloque[]; motivo: string }): CorreoRenderizado {
  const encabezado =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr>` +
    `<td style="vertical-align:middle;"><span style="display:inline-block;width:12px;height:12px;border-radius:6px;background:${MARCA.violeta};">&nbsp;</span></td>` +
    `<td style="vertical-align:middle;padding-left:8px;${fuente(22, 26, MARCA.titulo)}font-weight:700;letter-spacing:-0.5px;">aura</td>` +
    `</tr></table>`;
  return {
    html: documento({
      preheader: p.preheader,
      acentoSolido: MARCA.violeta,
      acentoFondo: `background:${MARCA.violeta};background-image:linear-gradient(90deg, ${MARCA.violeta}, ${MARCA.teal});`,
      encabezado,
      cuerpo: p.bloques.map((b) => b.html).join('\n'),
      pie: `${escapar(p.motivo)}<br>${escapar(PIE_AURA)}`,
    }),
    text: textoPlano('AURA', p.bloques, [p.motivo, PIE_AURA]),
  };
}

/** Correo al cliente final con la marca del negocio (factura / nota crédito). */
export function correoNegocio(p: {
  negocio: { nombre: string; logoUrl?: string | null };
  preheader: string;
  bloques: Bloque[];
}): CorreoRenderizado {
  const logo = urlPublicaLogo(p.negocio.logoUrl);
  const nombre = escapar(p.negocio.nombre);
  const marca = logo
    ? `<img src="${escapar(logo)}" alt="${nombre}" height="56" style="display:block;height:56px;max-height:56px;width:auto;border:0;outline:none;text-decoration:none;">`
    : `<span style="${fuente(22, 28, MARCA.titulo)}font-weight:700;">${nombre}</span>`;
  return {
    html: documento({
      preheader: p.preheader,
      acentoSolido: MARCA.neutro,
      acentoFondo: `background:${MARCA.neutro};`,
      encabezado: `<div style="margin:0 0 24px;">${marca}</div>`,
      cuerpo: p.bloques.map((b) => b.html).join('\n'),
      pie: escapar(PIE_NEGOCIO),
    }),
    text: textoPlano(p.negocio.nombre, p.bloques, [PIE_NEGOCIO]),
  };
}
