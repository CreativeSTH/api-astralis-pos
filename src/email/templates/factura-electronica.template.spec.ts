import { construirCorreoFactura } from './factura-electronica.template';

describe('construirCorreoFactura', () => {
  const original = process.env.BACKEND_PUBLIC_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.BACKEND_PUBLIC_URL;
    else process.env.BACKEND_PUBLIC_URL = original;
  });
  const base = {
    tipo: 'FACTURA' as const,
    nombreCliente: 'Ana',
    negocio: { nombre: 'El Clavo', logoUrl: '/uploads/negocios/logos/n.png' },
    numero: 'FE120',
    fecha: '2026-10-05',
    total: 32130,
  };

  it('factura: saluda, nombra al negocio, número, fecha y total; texto plano equivalente', () => {
    const { html, text } = construirCorreoFactura(base);
    expect(html).toContain('Hola, Ana.');
    expect(html).toContain('te envía tu factura electrónica');
    expect(html).toContain('FE120');
    expect(html).toContain('5 de octubre de 2026');
    expect(html).toMatch(/\$\s?32\.130/);
    expect(html).toContain('Enviado con AURA');
    expect(text).toMatch(/Total: \$\s?32\.130/);
    expect(text).toContain('le llegará a El Clavo');
  });

  it('nota crédito: texto propio y "Valor devuelto"', () => {
    const { html, text } = construirCorreoFactura({ ...base, tipo: 'NOTA_CREDITO', numero: 'NC12' });
    expect(html).toContain('te envía la nota crédito');
    expect(html).toContain('de tu devolución');
    expect(text).toContain('Valor devuelto');
    expect(html).not.toContain('tu factura electrónica');
  });

  it('logo con BACKEND_PUBLIC_URL; sin ella, el nombre del negocio', () => {
    process.env.BACKEND_PUBLIC_URL = 'https://api.somosaura.dev';
    expect(construirCorreoFactura(base).html).toContain('<img src="https://api.somosaura.dev/uploads/negocios/logos/n.png"');
    delete process.env.BACKEND_PUBLIC_URL;
    expect(construirCorreoFactura(base).html).not.toContain('<img');
  });

  it('escapa el HTML de los nombres', () => {
    const { html } = construirCorreoFactura({ ...base, nombreCliente: '<b>x</b>', negocio: { nombre: 'A&B' } });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('A&amp;B');
  });
});
