import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ComprobantesService, LEYENDA_NO_FACTURA } from './comprobantes.service';
import { VentasService } from './ventas.service';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { PlantillaComprobante } from '../facturacion/entities/plantilla-comprobante.entity';
import { DocumentoElectronico } from '../facturacion-electronica/entities/documento-electronico.entity';
import { EstadoDocumentoElectronico } from '../facturacion-electronica/entities/estado-documento-electronico.enum';
import { FacturaPdfService } from '../facturacion-electronica/factura-pdf.service';

describe('ComprobantesService — contenido imprimible', () => {
  let service: ComprobantesService;
  let ventas: { findOne: jest.Mock };
  let documentos: { findOne: jest.Mock };
  let clientes: { findOne: jest.Mock };
  let facturaPdf: { generarQrDataUrl: jest.Mock };
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
    facturaPdf = { generarQrDataUrl: jest.fn().mockResolvedValue('data:image/png;base64,QR') };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ComprobantesService,
        { provide: VentasService, useValue: ventas },
        { provide: FacturaPdfService, useValue: facturaPdf },
        { provide: getRepositoryToken(Negocio), useValue: { findOneOrFail: jest.fn().mockResolvedValue({ nombre: 'Ferretería', nit: '1' }) } },
        { provide: getRepositoryToken(Sucursal), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(PlantillaComprobante), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(DocumentoElectronico), useValue: documentos },
        { provide: getRepositoryToken(Cliente), useValue: clientes },
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
});
