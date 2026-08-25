import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITMO = 'aes-256-gcm';

function obtenerClaveMaestra(): Buffer {
  const hex = process.env.CIFRADO_CLAVE_MAESTRA;
  if (!hex) {
    throw new Error('CIFRADO_CLAVE_MAESTRA no está configurada');
  }
  return Buffer.from(hex, 'hex');
}

export function encriptar(textoPlano: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITMO, obtenerClaveMaestra(), iv);
  const cifrado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), cifrado.toString('base64')].join(':');
}

export function desencriptar(textoCifrado: string): string {
  const [ivB64, authTagB64, cifradoB64] = textoCifrado.split(':');
  const decipher = createDecipheriv(ALGORITMO, obtenerClaveMaestra(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plano = Buffer.concat([decipher.update(Buffer.from(cifradoB64, 'base64')), decipher.final()]);
  return plano.toString('utf8');
}
