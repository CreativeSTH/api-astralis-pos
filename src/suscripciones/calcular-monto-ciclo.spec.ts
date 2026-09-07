import { calcularMontoCiclo } from './suscripciones.service';
import { CicloFacturacion } from './entities/ciclo-facturacion.enum';
import { Paquete } from '../paquetes/entities/paquete.entity';

const paquete = { precioMensual: 139900 } as Paquete;

describe('calcularMontoCiclo', () => {
  it('mensual sin early-bird: precioMensual tal cual, en centavos', () => {
    expect(calcularMontoCiclo(paquete, CicloFacturacion.MENSUAL, false)).toBe(13990000);
  });

  it('mensual con early-bird: 25% off sobre precioMensual', () => {
    expect(calcularMontoCiclo(paquete, CicloFacturacion.MENSUAL, true)).toBe(Math.round(13990000 * 0.75));
  });

  it('anual sin early-bird: precioMensual × 12 × (1 - DESCUENTO_ANUAL_PCT)', () => {
    const esperado = Math.round(139900 * 12 * (1 - 0.17) * 100);
    expect(calcularMontoCiclo(paquete, CicloFacturacion.ANUAL, false)).toBe(esperado);
  });

  it('anual con early-bird: el 25% se aplica sobre la base anual ya con el 2-meses-gratis, no sobre el precio de lista', () => {
    const baseAnual = 139900 * 12 * (1 - 0.17);
    const esperado = Math.round(baseAnual * 0.75 * 100);
    expect(calcularMontoCiclo(paquete, CicloFacturacion.ANUAL, true)).toBe(esperado);
  });
});
