import { promises as fs } from 'fs';

type FirmaConocida = 'jpg' | 'png' | 'webp' | 'pdf';

const FIRMAS: Array<{
  tipo: FirmaConocida;
  coincide: (buf: Buffer) => boolean;
}> = [
  {
    tipo: 'jpg',
    coincide: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    tipo: 'png',
    coincide: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    tipo: 'webp',
    coincide: (b) =>
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
  { tipo: 'pdf', coincide: (b) => b.toString('ascii', 0, 4) === '%PDF' },
];

/**
 * La extensión del nombre de archivo no prueba nada — cualquiera puede renombrar un archivo
 * cualquiera a `.jpg`. Esto lee los primeros bytes del archivo ya guardado en disco por Multer
 * y confirma que el contenido real coincide con alguno de los formatos esperados. Multer no
 * permite este chequeo antes de escribir (con `diskStorage`, `fileFilter` no tiene acceso al
 * contenido — solo llega el nombre), por eso se valida después y se borra el archivo si no pasa.
 */
export async function tieneFirmaValida(rutaArchivo: string): Promise<boolean> {
  const handle = await fs.open(rutaArchivo, 'r');
  try {
    const buffer = Buffer.alloc(12);
    await handle.read(buffer, 0, 12, 0);
    return FIRMAS.some((firma) => firma.coincide(buffer));
  } finally {
    await handle.close();
  }
}
