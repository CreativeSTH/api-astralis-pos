import {
  construirAvisoTopeFacturacion,
  DatosAvisoTope,
} from './tope-facturacion.template';

const base: DatosAvisoTope = {
  nivel: 70,
  anio: 2026,
  ingresos: 132_000_000,
  tope: 183_309_000,
  porcentaje: 72.01,
  yaFacturaElectronica: false,
  fechaLimiteGracia: null,
  linkFacturacion:
    'http://localhost:4200/configuracion/facturacion-electronica',
  linkAyuda:
    'https://somosaura.com.co/ayuda/por-que-estoy-obligado-a-facturar-electronicamente',
};

describe('construirAvisoTopeFacturacion', () => {
  it('70/90: porcentaje sin decimales, montos en pesos y aclaración de mínimo', () => {
    const { subject, html, mensajeAlerta } =
      construirAvisoTopeFacturacion(base);
    expect(subject).toBe(
      'Tus ventas van en el 72% del tope para no facturar electrónicamente',
    );
    expect(mensajeAlerta).toContain('132.000.000');
    expect(mensajeAlerta).toContain('183.309.000');
    expect(mensajeAlerta).toContain('en 2026');
    expect(mensajeAlerta).toContain('Es un mínimo');
    expect(html).toContain(base.linkFacturacion);
  });

  it('100 sin facturación electrónica: fecha límite en palabras y 40 días', () => {
    const { subject, mensajeAlerta } = construirAvisoTopeFacturacion({
      ...base,
      nivel: 100,
      porcentaje: 101.3,
      fechaLimiteGracia: '2026-11-07',
    });
    expect(subject).toBe(
      'Superaste el tope de 3.500 UVT: debes facturar electrónicamente',
    );
    expect(mensajeAlerta).toContain(
      'Tienes 40 días, hasta el 7 de noviembre de 2026',
    );
    expect(mensajeAlerta).toContain('no podrás cobrar');
  });

  it('100 ya facturando electrónicamente: no tiene que hacer nada', () => {
    const { mensajeAlerta } = construirAvisoTopeFacturacion({
      ...base,
      nivel: 100,
      yaFacturaElectronica: true,
    });
    expect(mensajeAlerta).toContain('no tienes que hacer nada más');
    expect(mensajeAlerta).not.toContain('40 días');
  });

  it('incluye el enlace al artículo de ayuda en el correo (no en el mensaje de la campana)', () => {
    const { html, mensajeAlerta } = construirAvisoTopeFacturacion(base);
    expect(html).toContain(base.linkAyuda);
    expect(html).toContain('¿Por qué me pasa esto?');
    expect(mensajeAlerta).not.toContain('http');
  });
});
