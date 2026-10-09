import { construirCorreoRecordatorioProximo } from './recordatorio-proximo-cobro.template';
import { construirCorreoRecordatorioDia0 } from './recordatorio-dia-cobro.template';
import { DatosPlanCorreo } from './comun';
import { CicloFacturacion } from '../../suscripciones/entities/ciclo-facturacion.enum';

const base: DatosPlanCorreo = {
  nombre: 'Ana',
  nombreNegocio: 'Mi Tienda',
  plan: 'Profesional',
  ciclo: CicloFacturacion.MENSUAL,
  valor: 139900,
  fechaFin: new Date('2026-10-10T17:00:00Z'),
  enPrueba: false,
  tieneTarjeta: true,
  ultimosCuatro: '4242',
  linkMiPlan: 'https://app.x/configuracion/mi-plan',
};

describe('recordatorio de próximo cobro', () => {
  it('con tarjeta: se renueva, resumen completo y "Ver mi plan"', () => {
    const c = construirCorreoRecordatorioProximo({ ...base, dias: 2 });
    expect(c.subject).toBe('Tu plan Profesional se renueva en 2 días');
    expect(c.html).toMatch(/\$\s?139\.900/);
    expect(c.html).toContain('10 de octubre de 2026');
    expect(c.html).toContain('•••• 4242');
    expect(c.html).toContain('Mensual');
    expect(c.html).toContain('>Ver mi plan</a>');
    expect(c.text).toContain('Ver mi plan: https://app.x/configuracion/mi-plan');
    expect(c.text).toMatch(/Valor: \$\s?139\.900/);
  });

  it('mañana, anual', () => {
    const c = construirCorreoRecordatorioProximo({ ...base, dias: 1, ciclo: CicloFacturacion.ANUAL });
    expect(c.subject).toBe('Tu plan Profesional se renueva mañana');
    expect(c.html).toContain('Anual');
  });

  it('plan pagado sin tarjeta: vence y "Renovar mi plan"', () => {
    const c = construirCorreoRecordatorioProximo({ ...base, dias: 2, tieneTarjeta: false, ultimosCuatro: null });
    expect(c.subject).toBe('Tu acceso a AURA vence en 2 días');
    expect(c.html).toContain('>Renovar mi plan</a>');
    expect(c.html).not.toContain('••••');
  });

  it('prueba gratis sin tarjeta: termina y "Elegir mi plan", sin hablar de cobro', () => {
    const c = construirCorreoRecordatorioProximo({ ...base, dias: 1, enPrueba: true, tieneTarjeta: false, ultimosCuatro: null });
    expect(c.subject).toBe('Tu prueba gratis de AURA termina mañana');
    expect(c.html).toContain('>Elegir mi plan</a>');
    expect(c.html).not.toMatch(/cobr/i);
  });

  it('prueba con tarjeta se trata como renovación automática', () => {
    expect(construirCorreoRecordatorioProximo({ ...base, dias: 2, enPrueba: true }).subject).toBe('Tu plan Profesional se renueva en 2 días');
  });

  it('sin precio no muestra la fila Valor', () => {
    expect(construirCorreoRecordatorioProximo({ ...base, dias: 2, valor: 0 }).text).not.toContain('Valor:');
  });
});

describe('recordatorio del día del cobro', () => {
  it('con tarjeta: hoy renovamos, sin botón obligatorio pero con enlace', () => {
    const c = construirCorreoRecordatorioDia0(base);
    expect(c.subject).toBe('Hoy renovamos tu plan Profesional');
    expect(c.html).toContain('te avisaremos');
    expect(c.text).toContain('Ver mi plan: https://app.x/configuracion/mi-plan');
  });

  it('plan pagado sin tarjeta: vence hoy, "Renovar ahora"', () => {
    const c = construirCorreoRecordatorioDia0({ ...base, tieneTarjeta: false, ultimosCuatro: null });
    expect(c.subject).toBe('Tu acceso a AURA vence hoy');
    expect(c.html).toContain('>Renovar ahora</a>');
  });

  it('prueba sin tarjeta: termina hoy, "Elegir mi plan"', () => {
    const c = construirCorreoRecordatorioDia0({ ...base, enPrueba: true, tieneTarjeta: false, ultimosCuatro: null });
    expect(c.subject).toBe('Tu prueba gratis de AURA termina hoy');
    expect(c.html).toContain('>Elegir mi plan</a>');
  });

  it('todo en tú', () => {
    const c = construirCorreoRecordatorioDia0({ ...base, tieneTarjeta: false });
    expect(c.html).not.toMatch(/Reactivá|tenés|recordá/);
  });
});
