import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ComprobantesService, LEYENDA_NO_FACTURA, LEYENDA_RECIBO_CAJA } from './comprobantes.service';
import { RegistroPagoCuota } from './entities/registro-pago-cuota.entity';
import { VentasService } from './ventas.service';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { DocumentoElectronico } from '../facturacion-electronica/entities/documento-electronico.entity';
import { EstadoDocumentoElectronico } from '../facturacion-electronica/entities/estado-documento-electronico.enum';
import { FacturaPdfService } from '../facturacion-electronica/factura-pdf.service';

describe('ComprobantesService — contenido imprimible', () => {
  let service: ComprobantesService;
  let ventas: { findOne: jest.Mock };
  let documentos: { findOne: jest.Mock };
  let clientes: { findOne: jest.Mock };
  let facturaPdf: { generarQrDataUrl: jest.Mock };
  let registros: { findOne: jest.Mock };
  let sucursales: { findOne: jest.Mock };
  const ventaBase = {
    id: 'venta-1', negocioId: 'neg-1', sucursalId: 'suc-1', tipoVenta: 'CONTADO', clienteId: null,
    createdAt: new Date('2026-09-29T02:01:13Z'), nombreCliente: 'Consumidor final', items: [], pagos: [],
    subtotal: 27000, descuentoTotal: 0, impuestoTotal: 5130, total: 32130,
  };
  /** Documento aceptado en producción con su snapshot completo. */
  const docAceptado = {
    estado: EstadoDocumentoElectronico.ACEPTADO, ambiente: 'PRODUCCION', numeroCompleto: 'FE17', prefijo: 'FE',
    fechaEmision: new Date('2026-09-29T02:01:20Z'), cufe: 'cufe-17', qrContenido: 'QR-17',
    resolucionNumero: '18760000001', resolucionFechaInicio: '2026-01-01', resolucionFechaFin: '2027-01-01',
    resolucionRangoDesde: 1, resolucionRangoHasta: 1000,
    emisorRazonSocial: 'Mascotas SAS', emisorNit: '899999034', emisorDireccion: 'Calle 1', emisorCiudad: 'Cali',
  };
  const ventaElectronica = { ...ventaBase, tipoComprobanteEmitido: 'FACTURA_ELECTRONICA' };

  beforeEach(async () => {
    ventas = { findOne: jest.fn() };
    documentos = { findOne: jest.fn().mockResolvedValue(null) };
    clientes = { findOne: jest.fn().mockResolvedValue(null) };
    registros = { findOne: jest.fn() };
    sucursales = { findOne: jest.fn().mockResolvedValue({ direccion: 'Calle Sucursal', telefono: null }) };
    facturaPdf = { generarQrDataUrl: jest.fn().mockResolvedValue('data:image/png;base64,QR') };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ComprobantesService,
        { provide: VentasService, useValue: ventas },
        { provide: FacturaPdfService, useValue: facturaPdf },
        {
          provide: getRepositoryToken(Negocio),
          useValue: {
            findOneOrFail: jest.fn().mockResolvedValue({
              nombre: 'Ferretería', nit: '1', logoUrl: '/uploads/negocios/logos/l.png', direccion: 'Calle Negocio',
              telefono: '111', mensajeCierreComprobante: '¡Vuelve pronto!', terminosComprobante: 'Sin devoluciones',
            }),
          },
        },
        { provide: getRepositoryToken(Sucursal), useValue: sucursales },
        { provide: getRepositoryToken(DocumentoElectronico), useValue: documentos },
        { provide: getRepositoryToken(Cliente), useValue: clientes },
        { provide: getRepositoryToken(RegistroPagoCuota), useValue: registros },
      ],
    }).compile();
    service = moduleRef.get(ComprobantesService);
  });

  it('recibo: su consecutivo, la leyenda de "no es factura" y sin bloque electrónico', async () => {
    ventas.findOne.mockResolvedValue({ ...ventaBase, tipoComprobanteEmitido: 'RECIBO', numeroComprobante: '000123' });
    const contenido = await service.obtenerContenido('venta-1');
    expect(contenido).toMatchObject({ tipo: 'RECIBO', numero: '000123', leyenda: LEYENDA_NO_FACTURA });
    expect(contenido.electronica).toBeUndefined();
    expect(documentos.findOne).not.toHaveBeenCalled();
  });

  it('factura convencional histórica: también lleva la leyenda', async () => {
    ventas.findOne.mockResolvedValue({ ...ventaBase, tipoComprobanteEmitido: 'FACTURA', numeroComprobante: '9' });
    expect((await service.obtenerContenido('venta-1')).leyenda).toBe(LEYENDA_NO_FACTURA);
  });

  it('factura electrónica aceptada: número, CUFE, QR, resolución, emisor del snapshot y consumidor final', async () => {
    ventas.findOne.mockResolvedValue(ventaElectronica);
    documentos.findOne.mockResolvedValue(docAceptado);
    const contenido = await service.obtenerContenido('venta-1');

    expect(contenido).toMatchObject({ tipo: 'FACTURA_ELECTRONICA', numero: 'FE17', leyenda: undefined });
    expect(contenido.electronica).toMatchObject({
      estado: 'ACEPTADO', encabezado: null, numeroCompleto: 'FE17', cufe: 'cufe-17', qrDataUrl: 'data:image/png;base64,QR',
      emisor: { razonSocial: 'Mascotas SAS', nitConDv: '899999034-1', direccion: 'Calle 1, Cali' },
      adquirente: { nombre: 'Consumidor final', identificacion: 'CC 222222222222' },
      formaPago: 'Contado', proveedorTecnologico: 'Proveedor tecnológico: Alegra (NIT 900559088)',
    });
    expect(contenido.electronica!.resolucion).toContain('Resolución No. 18760000001');
    expect(facturaPdf.generarQrDataUrl).toHaveBeenCalledWith('QR-17');
    expect(documentos.findOne).toHaveBeenCalledWith({ where: { ventaId: 'venta-1', negocioId: 'neg-1' } });
  });

  it('factura electrónica sin documento todavía → "En validación DIAN", encabezado de validación y sin QR', async () => {
    ventas.findOne.mockResolvedValue(ventaElectronica);
    const contenido = await service.obtenerContenido('venta-1');
    expect(contenido.numero).toBe('En validación DIAN');
    expect(contenido.electronica).toMatchObject({
      estado: 'PENDIENTE', encabezado: 'EN VALIDACIÓN DIAN — REIMPRIMIBLE', cufe: null, qrDataUrl: null, resolucion: null, emisor: null,
    });
    expect(facturaPdf.generarQrDataUrl).not.toHaveBeenCalled();
  });

  it('rechazada: encabezado de rechazo y sin QR aunque tenga CUFE', async () => {
    ventas.findOne.mockResolvedValue(ventaElectronica);
    documentos.findOne.mockResolvedValue({ ...docAceptado, estado: EstadoDocumentoElectronico.RECHAZADO });
    const contenido = await service.obtenerContenido('venta-1');
    expect(contenido.electronica).toMatchObject({ encabezado: 'RECHAZADA POR LA DIAN — SIN VALIDEZ FISCAL', qrDataUrl: null });
    expect(facturaPdf.generarQrDataUrl).not.toHaveBeenCalled();
  });

  it('sandbox aceptada: encabezado de documento de prueba', async () => {
    ventas.findOne.mockResolvedValue(ventaElectronica);
    documentos.findOne.mockResolvedValue({ ...docAceptado, ambiente: 'SANDBOX' });
    expect((await service.obtenerContenido('venta-1')).electronica!.encabezado).toBe('DOCUMENTO DE PRUEBA — SIN VALIDEZ FISCAL');
  });

  it('venta a crédito con cliente con NIT: adquirente del cliente y forma de pago crédito', async () => {
    ventas.findOne.mockResolvedValue({ ...ventaElectronica, tipoVenta: 'CREDITO', clienteId: 'cli-1' });
    documentos.findOne.mockResolvedValue(docAceptado);
    clientes.findOne.mockResolvedValue({ nombre: 'Ferretería SAS', documentoIdentidad: '899999034', tipoDocumentoIdentidad: '31' });
    const contenido = await service.obtenerContenido('venta-1');
    expect(clientes.findOne).toHaveBeenCalledWith({ where: { id: 'cli-1', negocioId: 'neg-1' } });
    expect(contenido.electronica).toMatchObject({
      adquirente: { nombre: 'Ferretería SAS', identificacion: 'NIT 899999034' }, formaPago: 'Crédito',
    });
  });

  describe('recibo de caja de un abono', () => {
    const abono = {
      id: 'abono-1', monto: 45_000, metodoPago: 'Nequi', referenciaPago: 'NQ-99', numeroRecibo: 'RC-7',
      fecha: new Date('2026-09-29T15:00:00Z'), moraPagada: '5000.00', saldoVentaAnterior: '200000.00', saldoVentaNuevo: '160000.00',
      cuota: { numero: 1, ventaId: 'venta-1' },
    };
    const ventaCredito = {
      ...ventaBase, tipoVenta: 'CREDITO', nombreCliente: 'Ana Gómez', tipoComprobanteEmitido: 'RECIBO', numeroComprobante: 'R-15',
      cuotas: [{ numero: 1 }, { numero: 2 }, { numero: 3 }],
    };

    it('arma el recibo con número RC, un ítem por el abono, el pago y la foto de saldos', async () => {
      registros.findOne.mockResolvedValue(abono);
      ventas.findOne.mockResolvedValue(ventaCredito);

      const c = await service.obtenerContenidoAbono('abono-1');

      expect(registros.findOne).toHaveBeenCalledWith({ where: { id: 'abono-1' }, relations: { cuota: true } });
      expect(ventas.findOne).toHaveBeenCalledWith('venta-1');
      expect(c).toMatchObject({
        tipo: 'RECIBO_CAJA', numero: 'RC-7', fecha: abono.fecha, cliente: 'Ana Gómez',
        items: [{ nombre: 'Abono cuota 1 de 3', cantidad: 1, subtotal: 45_000, baseImponible: 45_000, impuesto: 0 }],
        subtotal: 45_000, descuento: 0, impuesto: 0, total: 45_000,
        pagos: [{ metodo: 'Nequi', monto: 45_000 }],
        mensajeCierre: '¡Gracias por su pago!', leyenda: LEYENDA_RECIBO_CAJA,
        abono: {
          numeroCuota: 1, totalCuotas: 3, comprobanteVenta: 'R-15', tipoComprobanteVenta: 'Recibo',
          moraPagada: 5_000, saldoAnterior: 200_000, saldoNuevo: 160_000, referenciaPago: 'NQ-99',
        },
      });
      expect(c.electronica).toBeUndefined();
    });

    it('venta con factura electrónica: referencia el número del documento', async () => {
      registros.findOne.mockResolvedValue(abono);
      ventas.findOne.mockResolvedValue({ ...ventaCredito, tipoComprobanteEmitido: 'FACTURA_ELECTRONICA', numeroComprobante: null });
      documentos.findOne.mockResolvedValue({ numeroCompleto: 'FE17' });
      const c = await service.obtenerContenidoAbono('abono-1');
      expect(c.abono).toMatchObject({ comprobanteVenta: 'FE17', tipoComprobanteVenta: 'Factura electrónica' });
    });

    it('abono anterior a los recibos de caja: "Sin numerar" y sin saldos', async () => {
      registros.findOne.mockResolvedValue({ ...abono, numeroRecibo: null, saldoVentaAnterior: null, saldoVentaNuevo: null, moraPagada: '0' });
      ventas.findOne.mockResolvedValue(ventaCredito);
      const c = await service.obtenerContenidoAbono('abono-1');
      expect(c.numero).toBe('Sin numerar');
      expect(c.abono).toMatchObject({ saldoAnterior: null, saldoNuevo: null, moraPagada: 0 });
    });

    it('abono inexistente → 404; abono de otro negocio → el 404 de VentasService.findOne', async () => {
      registros.findOne.mockResolvedValue(null);
      await expect(service.obtenerContenidoAbono('nope')).rejects.toBeInstanceOf(NotFoundException);

      // Abono de otro negocio: mismo 404 que uno inexistente, sin revelar el id de la venta ajena.
      registros.findOne.mockResolvedValue(abono);
      ventas.findOne.mockRejectedValue(new NotFoundException('Venta con ID venta-ajena no encontrada'));
      await expect(service.obtenerContenidoAbono('abono-1')).rejects.toThrow('Abono no encontrado');
    });
  });

  describe('formato de impresión (fase 5b)', () => {
    it('formato del negocio y dirección de la sucursal (teléfono del negocio si la sucursal no tiene)', async () => {
      ventas.findOne.mockResolvedValue({ ...ventaBase, tipoComprobanteEmitido: 'RECIBO', numeroComprobante: '8' });
      const c = await service.obtenerContenido('venta-1');
      expect(sucursales.findOne).toHaveBeenCalledWith({ where: { id: 'suc-1' } });
      expect(c).toMatchObject({
        negocio: { nombre: 'Ferretería', nit: '1', logoUrl: '/uploads/negocios/logos/l.png' },
        emisor: { direccion: 'Calle Sucursal', telefono: '111' },
        mensajeCierre: '¡Vuelve pronto!',
        terminos: 'Sin devoluciones',
      });
      expect(c).not.toHaveProperty('dian');
    });

    it('recibo de caja: logo y dirección igual que la venta, sin términos y con su mensaje fijo', async () => {
      registros.findOne.mockResolvedValue({
        id: 'abono-1', monto: 1000, metodoPago: 'Nequi', numeroRecibo: 'RC-1', fecha: new Date(), moraPagada: '0',
        saldoVentaAnterior: null, saldoVentaNuevo: null, cuota: { numero: 1, ventaId: 'venta-1' },
      });
      ventas.findOne.mockResolvedValue({ ...ventaBase, cuotas: [{ numero: 1 }] });
      const c = await service.obtenerContenidoAbono('abono-1');
      expect(c).toMatchObject({
        negocio: { logoUrl: '/uploads/negocios/logos/l.png' },
        emisor: { direccion: 'Calle Sucursal' },
        mensajeCierre: '¡Gracias por su pago!',
      });
      expect(c.terminos).toBeUndefined();
    });
  });
});
