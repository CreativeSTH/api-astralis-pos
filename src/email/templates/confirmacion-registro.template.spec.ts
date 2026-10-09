import { construirCorreoConfirmacion } from './confirmacion-registro.template';

describe('construirCorreoConfirmacion', () => {
  const link = 'https://app.somosaura.dev/verificar-email?token=abc';

  it('en tú, con negocio, botón, vencimiento y respaldo del enlace', () => {
    const c = construirCorreoConfirmacion({ nombre: 'Ana', nombreNegocio: 'Mi Tienda', linkVerificacion: link });
    expect(c.subject).toBe('Confirma tu correo para empezar en AURA');
    expect(c.html).toContain('Hola, Ana.');
    expect(c.html).toContain('Mi Tienda');
    expect(c.html).toContain('>Confirmar mi correo</a>');
    expect(c.html).toContain('copia y pega este enlace');
    expect(c.html).toContain('vence en 24 horas');
    expect(c.html).not.toMatch(/Confirmá|tenés/);
    expect(c.text).toContain(`Confirmar mi correo: ${link}`);
    expect(c.text).toContain('administras Mi Tienda en AURA');
  });

  it('sin negocio habla de "tu cuenta en AURA" y escapa el nombre', () => {
    const c = construirCorreoConfirmacion({ nombre: '<b>Ana</b>', linkVerificacion: link });
    expect(c.html).toContain('tu cuenta en AURA');
    expect(c.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
  });
});
