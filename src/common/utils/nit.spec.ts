import { calcularDigitoVerificacion, limpiarNit } from './nit';

describe('nit utils', () => {
  it('limpiarNit quita guiones, puntos y espacios', () => {
    expect(limpiarNit('900.123.456-7')).toBe('9001234567');
    expect(limpiarNit('900 123 456')).toBe('900123456');
  });

  it('calcula el dv del NIT público de la DIAN (899999034 → 1)', () => {
    expect(calcularDigitoVerificacion('899999034')).toBe('1');
  });

});
