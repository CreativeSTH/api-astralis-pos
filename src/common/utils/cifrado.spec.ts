import { encriptar, desencriptar } from './cifrado';

describe('cifrado', () => {
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
