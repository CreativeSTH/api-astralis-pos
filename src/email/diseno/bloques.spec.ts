import { boton, enlace, enlaceEnTexto, escapar, fuerte, nota, parrafo, resumen, titulo } from './bloques';

describe('bloques de correo', () => {
  it('escapar cubre &, <, >, comillas', () => {
    expect(escapar(`<a href="x">Tom & 'Jerry'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
  });

  it('párrafo escapa el texto y las partes en negrita', () => {
    const b = parrafo('Hola ', fuerte('<script>x</script>'), ' & bienvenido');
    expect(b.html).toContain('Hola <strong');
    expect(b.html).toContain('&lt;script&gt;x&lt;/script&gt;</strong> &amp; bienvenido');
    expect(b.html).not.toContain('<script>');
    expect(b.texto).toBe('Hola <script>x</script> & bienvenido');
  });

  it('título y nota escapan', () => {
    expect(titulo('A<B').html).toContain('A&lt;B</h1>');
    expect(nota('"x"').html).toContain('&quot;x&quot;');
  });

  it('botón: tabla con enlace y versión de texto con la URL', () => {
    const b = boton('Confirmar', 'https://app.x/v?token=a&b=1');
    expect(b.html).toContain('href="https://app.x/v?token=a&amp;b=1"');
    expect(b.html).toContain('#6a45e5');
    expect(b.html).toContain('>Confirmar</a>');
    expect(b.texto).toBe('Confirmar: https://app.x/v?token=a&b=1');
  });

  it('enlace y enlaceEnTexto', () => {
    expect(enlace('Ayuda', 'https://a.co').texto).toBe('Ayuda: https://a.co');
    const e = enlaceEnTexto('https://a.co/x');
    expect(e.html).toContain('copia y pega este enlace');
    expect(e.html).toContain('https://a.co/x');
    expect(e.texto).toBe('');
  });

  it('resumen omite filas sin valor y vacío no dibuja nada', () => {
    const b = resumen([['Plan', 'Pro'], ['Tarjeta', null], ['Valor', '$ 1']]);
    expect(b.html).toContain('>Plan<');
    expect(b.html).not.toContain('Tarjeta');
    expect(b.texto).toBe('Plan: Pro\nValor: $ 1');
    expect(resumen([['Tarjeta', undefined]])).toEqual({ html: '', texto: '' });
  });

  it('resumen escapa etiquetas y valores', () => {
    expect(resumen([['<x>', '"y"']]).html).toContain('&lt;x&gt;');
  });
});
