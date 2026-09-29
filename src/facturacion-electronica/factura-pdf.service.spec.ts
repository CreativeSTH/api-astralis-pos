import { FacturaPdfService, DatosFacturaPdf, marcaDeAguaPara, formatearPesos, fechaHoraBogota } from './factura-pdf.service';
import { EstadoDocumentoElectronico } from './entities/estado-documento-electronico.enum';

function datos(overrides: Partial<DatosFacturaPdf['documento']> = {}, venta: Partial<DatosFacturaPdf['venta']> = {}): DatosFacturaPdf {
  return {
    documento: {
      estado: EstadoDocumentoElectronico.ACEPTADO, ambiente: 'PRODUCCION', numeroCompleto: 'DE7',
      fechaEmision: new Date('2026-09-06T23:41:48-05:00'), cufe: 'cufe-7', qrContenido: 'QR-7', prefijo: 'DE',
      resolucionNumero: '18760000001', resolucionFechaInicio: '2026-01-01', resolucionFechaFin: '2027-01-01',
      resolucionRangoDesde: 1, resolucionRangoHasta: 100000,
      emisorRazonSocial: 'Mascotas SAS', emisorNit: '899999034', emisorDireccion: 'Calle 1', emisorCiudad: 'Bogotá, D.C.',
      ...overrides,
    },
    venta: {
      tipoVenta: 'CONTADO', subtotal: 20000, descuentoTotal: 2000, impuestoTotal: 3420, total: 21420,
      nombreCliente: 'Consumidor final', cliente: null,
      items: [{ nombreProducto: 'Producto A', cantidad: 2, precioUnitario: 10000, baseImponible: 18000, impuesto: 3420 }],
      pagos: [{ metodoPago: 'Efectivo', monto: 21420 }],
      ...venta,
    },
    logo: null,
  };
}

describe('FacturaPdfService', () => {
  const service = new FacturaPdfService();

  describe('marcaDeAguaPara', () => {
    it('rechazada tiene prioridad sobre sandbox', () => {
      expect(marcaDeAguaPara(EstadoDocumentoElectronico.RECHAZADO, 'SANDBOX')).toBe('RECHAZADA POR LA DIAN — SIN VALIDEZ FISCAL');
    });
    it('sandbox aceptada → documento de prueba', () => {
      expect(marcaDeAguaPara(EstadoDocumentoElectronico.ACEPTADO, 'SANDBOX')).toBe('DOCUMENTO DE PRUEBA — SIN VALIDEZ FISCAL');
    });
    it('pendiente con CUFE en producción → pendiente de validación', () => {
      expect(marcaDeAguaPara(EstadoDocumentoElectronico.PENDIENTE, 'PRODUCCION')).toBe('PENDIENTE DE VALIDACIÓN DIAN');
    });
    it('aceptada (o con observaciones) en producción → sin marca', () => {
      expect(marcaDeAguaPara(EstadoDocumentoElectronico.ACEPTADO, 'PRODUCCION')).toBeNull();
      expect(marcaDeAguaPara(EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES, 'PRODUCCION')).toBeNull();
    });
  });

  describe('construirContenido', () => {
    it('emisor con NIT + dígito de verificación y régimen', () => {
      const c = service.construirContenido(datos());
      expect(c.emisor).toEqual({
        razonSocial: 'Mascotas SAS', nitConDv: '899999034-1', regimen: 'Responsable de IVA (O-48)', direccion: 'Calle 1, Bogotá, D.C.',
      });
    });

    it('encabezado con número completo y fecha/hora en hora de Colombia', () => {
      const c = service.construirContenido(datos());
      expect(c.encabezado).toEqual({ titulo: 'FACTURA ELECTRÓNICA DE VENTA', numero: 'DE7', fechaEmision: '2026-09-06 23:41:48' });
    });

    it('adquirente consumidor final cuando la venta no tiene cliente con documento', () => {
      expect(service.construirContenido(datos()).adquirente).toEqual({ nombre: 'Consumidor final', identificacion: 'CC 222222222222' });
    });

    it('adquirente con documento real', () => {
      const c = service.construirContenido(datos({}, { cliente: { nombre: 'Juan Pérez', documentoIdentidad: '900123456', tipoDocumentoIdentidad: '31' } }));
      expect(c.adquirente).toEqual({ nombre: 'Juan Pérez', identificacion: 'NIT 900123456' });
    });

    it('líneas con base, % IVA e IVA discriminados', () => {
      const [linea] = service.construirContenido(datos()).lineas;
      expect(linea).toEqual({
        descripcion: 'Producto A', cantidad: '2', valorUnitario: formatearPesos(10000),
        base: formatearPesos(18000), porcentajeIva: '19%', iva: formatearPesos(3420), total: formatearPesos(21420),
      });
    });

    it('totales con descuento, base gravable, IVA y total a pagar', () => {
      expect(service.construirContenido(datos()).totales).toEqual([
        { etiqueta: 'Subtotal', valor: formatearPesos(20000) },
        { etiqueta: 'Descuentos', valor: `-${formatearPesos(2000)}` },
        { etiqueta: 'Base gravable', valor: formatearPesos(18000) },
        { etiqueta: 'IVA', valor: formatearPesos(3420) },
        { etiqueta: 'Total a pagar', valor: formatearPesos(21420) },
      ]);
    });

    it('resolución, CUFE, QR sin modificar y pie con el proveedor tecnológico', () => {
      const c = service.construirContenido(datos());
      expect(c.resolucion).toBe('Numeración autorizada por la DIAN — Resolución No. 18760000001 del 2026-01-01, prefijo DE del 1 al 100000, vigente hasta 2027-01-01');
      expect(c.cufe).toBe('cufe-7');
      expect(c.qrContenido).toBe('QR-7');
      expect(c.pie).toContain('Proveedor tecnológico: Alegra (NIT 900559088)');
      expect(c.pie).toContain('Representación gráfica de la factura electrónica de venta');
    });

    it('forma y medios de pago', () => {
      expect(service.construirContenido(datos()).pago).toEqual({ forma: 'Contado', medios: [`Efectivo: ${formatearPesos(21420)}`] });
    });
  });

  describe('generar', () => {
    it('devuelve un PDF y genera el QR con el contenido exacto de Alegra', async () => {
      const qr = jest.spyOn(service as any, 'generarQrPng');
      const pdf = await service.generar(datos());
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      expect(qr).toHaveBeenCalledWith('QR-7');
    });

    it('un logo corrupto no rompe el PDF', async () => {
      const pdf = await service.generar({ ...datos(), logo: Buffer.from('esto no es una imagen') });
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('pagina automáticamente con muchos ítems', async () => {
      const items = Array.from({ length: 120 }, (_, i) => ({ nombreProducto: `Producto ${i}`, cantidad: 1, precioUnitario: 100, baseImponible: 100, impuesto: 19 }));
      const pdf = await service.generar(datos({}, { items }));
      const paginas = pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? [];
      expect(paginas.length).toBeGreaterThan(1);
    });
  });

  it('fechaHoraBogota formatea en hora de Colombia', () => {
    expect(fechaHoraBogota(new Date('2026-09-07T04:41:48Z'))).toBe('2026-09-06 23:41:48');
  });
});
