import { construirCorreoFactura } from './factura-electronica.template';

describe('construirCorreoFactura', () => {
  it('saluda al cliente, nombra al negocio, el número y el total en pesos', () => {
    const { html } = construirCorreoFactura({ nombreCliente: 'Ana', nombreNegocio: 'El Clavo', numero: 'FE120', total: 32130 });
    expect(html).toContain('Hola Ana');
    expect(html).toContain('El Clavo');
    expect(html).toContain('FE120');
    expect(html).toMatch(/\$\s?32\.130/);
  });

  it('escapa el HTML de los nombres', () => {
    const { html } = construirCorreoFactura({ nombreCliente: '<b>x</b>', nombreNegocio: 'A&B', numero: 'FE1', total: 1 });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('A&amp;B');
  });
});
