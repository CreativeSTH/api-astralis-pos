import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ComprobantesService } from './comprobantes.service';
import { VentasService } from './ventas.service';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { PlantillaComprobante } from '../facturacion/entities/plantilla-comprobante.entity';
import { DocumentoElectronico } from '../facturacion-electronica/entities/documento-electronico.entity';

describe('ComprobantesService — contenido imprimible', () => {
  let service: ComprobantesService;
  let ventas: { findOne: jest.Mock };
  let documentos: { findOne: jest.Mock };
  const ventaBase = {
    id: 'venta-1', negocioId: 'neg-1', sucursalId: 'suc-1', createdAt: new Date('2026-09-29T02:01:13Z'),
    nombreCliente: 'Consumidor final', items: [], pagos: [], subtotal: 27000, descuentoTotal: 0, impuestoTotal: 5130, total: 32130,
  };

  beforeEach(async () => {
    ventas = { findOne: jest.fn() };
    documentos = { findOne: jest.fn().mockResolvedValue(null) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ComprobantesService,
        { provide: VentasService, useValue: ventas },
        { provide: getRepositoryToken(Negocio), useValue: { findOneOrFail: jest.fn().mockResolvedValue({ nombre: 'Ferretería', nit: '1' }) } },
        { provide: getRepositoryToken(Sucursal), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(PlantillaComprobante), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(DocumentoElectronico), useValue: documentos },
      ],
    }).compile();
    service = moduleRef.get(ComprobantesService);
  });

  it('recibo: usa su consecutivo y no consulta documentos electrónicos', async () => {
    ventas.findOne.mockResolvedValue({ ...ventaBase, tipoComprobanteEmitido: 'RECIBO', numeroComprobante: '000123' });
    const contenido = await service.obtenerContenido('venta-1');
    expect(contenido).toMatchObject({ tipo: 'RECIBO', numero: '000123' });
    expect(documentos.findOne).not.toHaveBeenCalled();
  });

  it('factura electrónica: el número es el de la factura electrónica del negocio', async () => {
    ventas.findOne.mockResolvedValue({ ...ventaBase, tipoComprobanteEmitido: 'FACTURA_ELECTRONICA' });
    documentos.findOne.mockResolvedValue({ numeroCompleto: 'SBOX17' });
    const contenido = await service.obtenerContenido('venta-1');
    expect(contenido).toMatchObject({ tipo: 'FACTURA_ELECTRONICA', numero: 'SBOX17', dian: undefined });
    expect(documentos.findOne).toHaveBeenCalledWith({ where: { ventaId: 'venta-1', negocioId: 'neg-1' } });
  });

  it('factura electrónica todavía sin número → "En validación DIAN"', async () => {
    ventas.findOne.mockResolvedValue({ ...ventaBase, tipoComprobanteEmitido: 'FACTURA_ELECTRONICA' });
    const contenido = await service.obtenerContenido('venta-1');
    expect(contenido.numero).toBe('En validación DIAN');
  });
});
