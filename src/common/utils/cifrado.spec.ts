import { encriptar, desencriptar } from './cifrado';

describe('cifrado', () => {
  // Valor fijo de prueba: 32 bytes en hex para AES-256
  const CLAVE_MAESTRA_TEST = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

  beforeAll(() => {
    process.env.CIFRADO_CLAVE_MAESTRA = CLAVE_MAESTRA_TEST;
  });

  const original = 'clave-privada-super-secreta-de-wompi';

  it('desencripta lo que encriptó', () => {
    const cifrado = encriptar(original);
    expect(cifrado).not.toBe(original);
    expect(desencriptar(cifrado)).toBe(original);
  });

  it('dos encriptados del mismo texto no son iguales (IV aleatorio)', () => {
    expect(encriptar(original)).not.toBe(encriptar(original));
  });
});
