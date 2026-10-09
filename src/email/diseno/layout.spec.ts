import { correoAura, correoNegocio, urlPublicaLogo } from './layout';
import { boton, parrafo, titulo } from './bloques';

describe('layout de correos', () => {
  const original = process.env.BACKEND_PUBLIC_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.BACKEND_PUBLIC_URL;
    else process.env.BACKEND_PUBLIC_URL = original;
  });

  it('correoAura: documento completo con preheader, wordmark, bloques, motivo y pie', () => {
    const c = correoAura({
      preheader: 'Un clic <y> listo',
      bloques: [titulo('Hola'), parrafo('Texto'), boton('Ir', 'https://a.co')],
      motivo: 'Recibes este correo porque administras Mi Tienda en AURA.',
    });
    expect(c.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(c.html).toContain('Un clic &lt;y&gt; listo');
    expect(c.html).toContain('>aura<');
    expect(c.html).toContain('#7c5cff');
    expect(c.html).toContain('linear-gradient(90deg, #7c5cff, #2fd6ae)');
    expect(c.html).toContain('administras Mi Tienda en AURA');
    expect(c.html).toContain('somosaura.com.co');
    expect(c.text).toBe(
      'AURA\n\nHola\n\nTexto\n\nIr: https://a.co\n\n—\n\nRecibes este correo porque administras Mi Tienda en AURA.\n\nAURA · Sistema POS para tu negocio · somosaura.com.co',
    );
  });

  it('correoAura no deja líneas vacías por bloques sin texto', () => {
    const c = correoAura({ preheader: 'p', bloques: [parrafo('A'), { html: '<p>x</p>', texto: '' }, parrafo('B')], motivo: 'm' });
    expect(c.text).toContain('A\n\nB');
  });

  it('urlPublicaLogo: absoluta tal cual, relativa con BACKEND_PUBLIC_URL, null sin variable o sin logo', () => {
    expect(urlPublicaLogo('https://cdn.x/l.png')).toBe('https://cdn.x/l.png');
    delete process.env.BACKEND_PUBLIC_URL;
    expect(urlPublicaLogo('/uploads/negocios/logos/n.png')).toBeNull();
    process.env.BACKEND_PUBLIC_URL = 'https://api.somosaura.dev/';
    expect(urlPublicaLogo('/uploads/negocios/logos/n.png')).toBe('https://api.somosaura.dev/uploads/negocios/logos/n.png');
    expect(urlPublicaLogo(null)).toBeNull();
  });

  it('correoNegocio: logo del negocio si hay URL pública, gris neutro y "Enviado con AURA"', () => {
    process.env.BACKEND_PUBLIC_URL = 'https://api.somosaura.dev';
    const c = correoNegocio({ negocio: { nombre: 'El "Clavo"', logoUrl: '/uploads/l.png' }, preheader: 'p', bloques: [parrafo('Hola')] });
    expect(c.html).toContain('<img src="https://api.somosaura.dev/uploads/l.png" alt="El &quot;Clavo&quot;"');
    expect(c.html).toContain('#d6d3dc');
    expect(c.html).not.toContain('#2fd6ae');
    expect(c.html).toContain('Enviado con AURA');
    expect(c.text.startsWith('El "Clavo"\n\nHola')).toBe(true);
  });

  it('correoNegocio sin logo usa el nombre en texto', () => {
    delete process.env.BACKEND_PUBLIC_URL;
    const c = correoNegocio({ negocio: { nombre: 'A&B', logoUrl: '/uploads/l.png' }, preheader: 'p', bloques: [] });
    expect(c.html).not.toContain('<img');
    expect(c.html).toContain('A&amp;B</span>');
  });
});
