import { MARCA } from './marca';

/** Pieza de un correo: el HTML y su equivalente en texto plano, siempre juntos (spec 2026-10-08 §4). */
export interface Bloque {
  html: string;
  texto: string;
}

export type Fragmento = string | { fuerte: string };

export const fuerte = (texto: string): Fragmento => ({ fuerte: texto });

export function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const fragmentosHtml = (partes: Fragmento[]) =>
  partes
    .map((p) => (typeof p === 'string' ? escapar(p) : `<strong style="color:${MARCA.titulo};">${escapar(p.fuerte)}</strong>`))
    .join('');

const fragmentosTexto = (partes: Fragmento[]) => partes.map((p) => (typeof p === 'string' ? p : p.fuerte)).join('');

const estiloTexto = (tamano: number, alto: number, color: string) =>
  `font-family:${MARCA.fuente};font-size:${tamano}px;line-height:${alto}px;color:${color};`;

export function titulo(texto: string): Bloque {
  return {
    html: `<h1 style="margin:0 0 16px;${estiloTexto(22, 30, MARCA.titulo)}font-weight:700;">${escapar(texto)}</h1>`,
    texto,
  };
}

export function parrafo(...partes: Fragmento[]): Bloque {
  return {
    html: `<p style="margin:0 0 16px;${estiloTexto(16, 24, MARCA.texto)}">${fragmentosHtml(partes)}</p>`,
    texto: fragmentosTexto(partes),
  };
}

export function nota(...partes: Fragmento[]): Bloque {
  return {
    html: `<p style="margin:0 0 16px;${estiloTexto(14, 20, MARCA.textoSuave)}">${fragmentosHtml(partes)}</p>`,
    texto: fragmentosTexto(partes),
  };
}

/** Botón "bulletproof": tabla con fondo, para que Outlook también lo pinte. */
export function boton(etiqueta: string, url: string): Bloque {
  return {
    html:
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>` +
      `<td align="center" bgcolor="${MARCA.boton}" style="border-radius:10px;background:${MARCA.boton};">` +
      `<a href="${escapar(url)}" target="_blank" style="display:inline-block;padding:14px 28px;${estiloTexto(16, 20, '#ffffff')}font-weight:700;text-decoration:none;border-radius:10px;">${escapar(etiqueta)}</a>` +
      `</td></tr></table>`,
    texto: `${etiqueta}: ${url}`,
  };
}

export function enlace(etiqueta: string, url: string): Bloque {
  return {
    html: `<p style="margin:0 0 16px;${estiloTexto(14, 20, MARCA.texto)}"><a href="${escapar(url)}" target="_blank" style="color:${MARCA.boton};text-decoration:underline;">${escapar(etiqueta)}</a></p>`,
    texto: `${etiqueta}: ${url}`,
  };
}

/** Respaldo del botón en el HTML. En texto plano no hace falta: el botón ya imprime la URL. */
export function enlaceEnTexto(url: string): Bloque {
  return {
    html: `<p style="margin:0 0 16px;${estiloTexto(13, 20, MARCA.textoSuave)}word-break:break-all;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="${escapar(url)}" target="_blank" style="color:${MARCA.boton};">${escapar(url)}</a></p>`,
    texto: '',
  };
}

/** Recuadro etiqueta/valor. Las filas sin valor se omiten (p. ej. tarjeta sin últimos 4 dígitos). */
export function resumen(filas: [string, string | null | undefined][]): Bloque {
  const visibles = filas.filter((f): f is [string, string] => !!f[1]);
  if (visibles.length === 0) return { html: '', texto: '' };
  const filasHtml = visibles
    .map(([etiqueta, valor], i) => {
      const arriba = i === 0 ? 0 : 8;
      return (
        `<tr><td style="padding:${arriba}px 0 0;${estiloTexto(14, 20, MARCA.textoSuave)}">${escapar(etiqueta)}</td>` +
        `<td align="right" style="padding:${arriba}px 0 0 16px;${estiloTexto(14, 20, MARCA.titulo)}font-weight:700;">${escapar(valor)}</td></tr>`
      );
    })
    .join('');
  return {
    html:
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr>` +
      `<td bgcolor="${MARCA.resumenFondo}" style="padding:16px 20px;background:${MARCA.resumenFondo};border-radius:12px;">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filasHtml}</table>` +
      `</td></tr></table>`,
    texto: visibles.map(([e, v]) => `${e}: ${v}`).join('\n'),
  };
}
