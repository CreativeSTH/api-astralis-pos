import { construirCorreoCobroFallido, DatosCobroFallido } from './cobro-fallido.template';

const base: DatosCobroFallido = {
  nombre: 'Ana',
  nombreNegocio: 'Mi Tienda',
  plan: 'Profesional',
  valor: 139900,
  ultimosCuatro: '4242',
  intento: 1,
  linkMiPlan: 'https://app.x/configuracion/mi-plan',
  linkReactivar: 'https://app.x/suscripcion-vencida',
};

describe('construirCorreoCobroFallido', () => {
  it('intentos 1 y 2: reintento mañana, resumen con intento y "Actualizar mi tarjeta"', () => {
    const c = construirCorreoCobroFallido({ ...base, intento: 2 });
    expect(c.subject).toBe('No pudimos cobrar tu plan Profesional');
    expect(c.html).toContain('2 de 3');
    expect(c.html).toContain('•••• 4242');
    expect(c.html).toContain('Volveremos a intentarlo mañana');
    expect(c.text).toContain('Actualizar mi tarjeta: https://app.x/configuracion/mi-plan');
  });

  it('intento 3: cuenta en pausa y "Reactivar mi cuenta"', () => {
    const c = construirCorreoCobroFallido({ ...base, intento: 3 });
    expect(c.subject).toBe('Tu cuenta de AURA quedó en pausa');
    expect(c.html).toContain('Tus datos están a salvo');
    expect(c.text).toContain('Reactivar mi cuenta: https://app.x/suscripcion-vencida');
    expect(c.html).not.toMatch(/Reactivala|revisá/);
  });

  it('sin últimos 4 dígitos omite la fila Tarjeta', () => {
    expect(construirCorreoCobroFallido({ ...base, ultimosCuatro: null }).text).not.toContain('Tarjeta:');
  });
});
