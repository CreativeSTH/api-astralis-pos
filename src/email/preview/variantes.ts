import { CicloFacturacion } from '../../suscripciones/entities/ciclo-facturacion.enum';
import { CorreoConstruido } from '../diseno/layout';
import { DatosPlanCorreo } from '../templates/comun';
import { construirCorreoConfirmacion } from '../templates/confirmacion-registro.template';
import { construirCorreoRecordatorioProximo } from '../templates/recordatorio-proximo-cobro.template';
import { construirCorreoRecordatorioDia0 } from '../templates/recordatorio-dia-cobro.template';
import { construirCorreoCobroFallido, DatosCobroFallido } from '../templates/cobro-fallido.template';
import { construirAvisoTopeFacturacion, DatosAvisoTope } from '../templates/tope-facturacion.template';
import { construirCorreoFactura, DatosCorreoFactura } from '../templates/factura-electronica.template';

export interface VariantePreview {
  id: string;
  descripcion: string;
  correo: CorreoConstruido;
}

/** Datos de ejemplo fijos para revisar el diseño sin disparar flujos reales (spec 2026-10-08 §6). */
export function variantesPreview(): VariantePreview[] {
  const app = process.env.FRONTEND_URL ?? 'http://localhost:4200';
  const landing = process.env.LANDING_URL ?? 'https://somosaura.com.co';

  const plan: DatosPlanCorreo = {
    nombre: 'Ana Gómez',
    nombreNegocio: 'Panadería La Espiga',
    plan: 'Profesional',
    ciclo: CicloFacturacion.MENSUAL,
    valor: 139900,
    fechaFin: new Date('2026-10-10T17:00:00Z'),
    enPrueba: false,
    tieneTarjeta: true,
    ultimosCuatro: '4242',
    linkMiPlan: `${app}/configuracion/mi-plan`,
  };
  const sinTarjeta: DatosPlanCorreo = { ...plan, tieneTarjeta: false, ultimosCuatro: null };
  const prueba: DatosPlanCorreo = { ...sinTarjeta, enPrueba: true };

  const cobroFallido: DatosCobroFallido = {
    nombre: plan.nombre,
    nombreNegocio: plan.nombreNegocio,
    plan: plan.plan,
    valor: plan.valor,
    ultimosCuatro: plan.ultimosCuatro,
    intento: 1,
    linkMiPlan: plan.linkMiPlan,
    linkReactivar: `${app}/suscripcion-vencida`,
  };

  const tope: DatosAvisoTope = {
    nivel: 70,
    anio: 2026,
    ingresos: 132_000_000,
    tope: 183_309_000,
    porcentaje: 72.01,
    yaFacturaElectronica: false,
    fechaLimiteGracia: null,
    linkFacturacion: `${app}/facturacion/electronica`,
    linkAyuda: `${landing}/ayuda/por-que-estoy-obligado-a-facturar-electronicamente`,
    nombre: plan.nombre,
    nombreNegocio: plan.nombreNegocio,
  };

  const factura: DatosCorreoFactura = {
    tipo: 'FACTURA',
    nombreCliente: 'Carlos Ruiz',
    // Imagen pública de ejemplo; en el correo real sale de BACKEND_PUBLIC_URL + logoUrl del negocio.
    negocio: { nombre: 'Panadería La Espiga', logoUrl: 'https://placehold.co/240x80/png?text=La+Espiga' },
    numero: 'FE-120',
    fecha: '2026-10-05',
    total: 32130,
  };
  const conAsunto = (subject: string, c: { html: string; text: string }): CorreoConstruido => ({ subject, ...c });

  return [
    {
      id: 'confirmacion',
      descripcion: 'Confirmación de registro',
      correo: construirCorreoConfirmacion({
        nombre: 'Ana Gómez',
        nombreNegocio: 'Panadería La Espiga',
        linkVerificacion: `${app}/verificar-email?token=ejemplo`,
      }),
    },
    { id: 'proximo-con-tarjeta', descripcion: 'Recordatorio −2: con tarjeta', correo: construirCorreoRecordatorioProximo({ ...plan, dias: 2 }) },
    {
      id: 'proximo-sin-tarjeta',
      descripcion: 'Recordatorio −1: plan pagado sin tarjeta',
      correo: construirCorreoRecordatorioProximo({ ...sinTarjeta, dias: 1 }),
    },
    {
      id: 'proximo-prueba',
      descripcion: 'Recordatorio −2: prueba gratis sin tarjeta',
      correo: construirCorreoRecordatorioProximo({ ...prueba, dias: 2 }),
    },
    { id: 'dia0-con-tarjeta', descripcion: 'Día del cobro: con tarjeta', correo: construirCorreoRecordatorioDia0(plan) },
    { id: 'dia0-sin-tarjeta', descripcion: 'Día del cobro: plan pagado sin tarjeta', correo: construirCorreoRecordatorioDia0(sinTarjeta) },
    { id: 'dia0-prueba', descripcion: 'Día del cobro: prueba gratis sin tarjeta', correo: construirCorreoRecordatorioDia0(prueba) },
    { id: 'cobro-fallido-1', descripcion: 'Cobro fallido: intento 1', correo: construirCorreoCobroFallido(cobroFallido) },
    {
      id: 'cobro-fallido-3',
      descripcion: 'Cobro fallido: intento 3 (cuenta en pausa)',
      correo: construirCorreoCobroFallido({ ...cobroFallido, intento: 3 }),
    },
    { id: 'tope-70', descripcion: 'Tope UVT: 70 %', correo: construirAvisoTopeFacturacion(tope) },
    {
      id: 'tope-100-sin-fe',
      descripcion: 'Tope UVT: 100 % sin facturación electrónica',
      correo: construirAvisoTopeFacturacion({ ...tope, nivel: 100, porcentaje: 101.3, fechaLimiteGracia: '2026-11-14' }),
    },
    {
      id: 'tope-100-con-fe',
      descripcion: 'Tope UVT: 100 % ya facturando electrónicamente',
      correo: construirAvisoTopeFacturacion({ ...tope, nivel: 100, porcentaje: 101.3, yaFacturaElectronica: true }),
    },
    {
      id: 'factura-con-logo',
      descripcion: 'Factura: con logo del negocio',
      correo: conAsunto('Factura FE-120 de Panadería La Espiga', construirCorreoFactura(factura)),
    },
    {
      id: 'factura-sin-logo',
      descripcion: 'Factura: sin logo (nombre en texto)',
      correo: conAsunto(
        'Factura FE-120 de Panadería La Espiga',
        construirCorreoFactura({ ...factura, negocio: { nombre: factura.negocio.nombre } }),
      ),
    },
    {
      id: 'nota-credito',
      descripcion: 'Nota crédito de una devolución',
      correo: conAsunto(
        'Nota crédito NC-12 de Panadería La Espiga',
        construirCorreoFactura({ ...factura, tipo: 'NOTA_CREDITO', numero: 'NC-12', total: 12500 }),
      ),
    },
  ];
}
