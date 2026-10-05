import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { VentasService } from './ventas.service';
import { Venta } from './entities/venta.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
import { MovimientoInventario } from '../inventario/entities/movimiento-inventario.entity';
import { MovimientoCaja } from '../caja/entities/movimiento-caja.entity';
import { TurnoCaja } from '../caja/entities/turno-caja.entity';
import { DocumentoElectronico } from '../facturacion-electronica/entities/documento-electronico.entity';
import { CajaService } from '../caja/caja.service';
import { ClientesService } from '../clientes/clientes.service';
import { AuthService } from '../auth/auth.service';
import { PermisosService } from '../roles/permisos.service';
import { AlertasService } from '../alertas/alertas.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MetodosPagoService } from '../metodos-pago/metodos-pago.service';
import { NumeracionComprobanteService } from '../facturacion/numeracion-comprobante.service';
import { PromocionesPricingService } from '../cupones/promociones-pricing.service';
import { CuponValidacionService } from '../cupones/cupon-validacion.service';
import { FacturacionElectronicaService } from '../facturacion-electronica/facturacion-electronica.service';
import { PoliticaFacturacionService } from '../politica-facturacion/politica-facturacion.service';
import { ContingenciaService } from '../facturacion-electronica/contingencia.service';
import { EstadoDocumentoElectronico } from '../facturacion-electronica/entities/estado-documento-electronico.enum';
import { AuditoriaService } from '../auditoria/auditoria.service';

/** Cancelar ya no puede dejar vigente ante la DIAN una factura aceptada (spec de devoluciones 3.7). */
describe('VentasService.cancelar — devoluciones y factura electrónica', () => {
  let service: VentasService;
  let venta: Record<string, unknown>;
  let documentos: { findOne: jest.Mock };
  let ventas: { findOne: jest.Mock; save: jest.Mock };
  let auditoria: { registrarAccion: jest.Mock };
  let manager: unknown;

  beforeEach(async () => {
    venta = {
      id: 'venta-1',
      negocioId: 'neg-1',
      turnoId: 'turno-1',
      bodegaId: 'bod-1',
      tipoVenta: 'CONTADO',
      estado: 'COMPLETADA',
      estadoDevolucion: 'NINGUNA',
      items: [],
      cuotas: [],
    };
    documentos = { findOne: jest.fn().mockResolvedValue(null) };
    ventas = { findOne: jest.fn(async () => venta), save: jest.fn(async (v) => v) };
    const repos = new Map<unknown, unknown>([
      [Venta, ventas],
      [Inventario, { findOne: jest.fn(), save: jest.fn() }],
      [MovimientoInventario, { create: jest.fn((m) => m), save: jest.fn() }],
      [MovimientoCaja, { delete: jest.fn() }],
      [TurnoCaja, { findOne: jest.fn().mockResolvedValue({ id: 'turno-1', estado: 'ABIERTO' }) }],
      [DocumentoElectronico, documentos],
    ]);
    manager = { getRepository: (entidad: unknown) => repos.get(entidad) };
    auditoria = { registrarAccion: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VentasService,
        { provide: getRepositoryToken(Venta), useValue: {} },
        { provide: getRepositoryToken(Inventario), useValue: {} },
        { provide: DataSource, useValue: { transaction: jest.fn((cb) => cb(manager)) } },
        { provide: CajaService, useValue: {} },
        { provide: ClientesService, useValue: { ajustarDeuda: jest.fn() } },
        { provide: AuthService, useValue: {} },
        { provide: PermisosService, useValue: { rolTienePermiso: jest.fn().mockResolvedValue(true) } },
        { provide: AlertasService, useValue: {} },
        { provide: RealtimeGateway, useValue: {} },
        { provide: MetodosPagoService, useValue: {} },
        { provide: NumeracionComprobanteService, useValue: {} },
        { provide: PromocionesPricingService, useValue: {} },
        { provide: CuponValidacionService, useValue: {} },
        { provide: FacturacionElectronicaService, useValue: {} },
        { provide: PoliticaFacturacionService, useValue: {} },
        { provide: ContingenciaService, useValue: {} },
        { provide: AuditoriaService, useValue: auditoria },
        { provide: ClsService, useValue: { get: (k: string) => (k === 'negocioId' ? 'neg-1' : 'usr-1') } },
      ],
    }).compile();
    service = moduleRef.get(VentasService);
  });

  it('no cancela una venta con factura electrónica aceptada: pide Devolución total', async () => {
    documentos.findOne.mockResolvedValue({ estado: EstadoDocumentoElectronico.ACEPTADO });
    await expect(service.cancelar('venta-1', { motivo: 'Error' })).rejects.toThrow('usa Devolución total');
    expect(ventas.save).not.toHaveBeenCalled();
  });

  it('no cancela una venta que ya tiene devoluciones', async () => {
    venta.estadoDevolucion = 'PARCIAL';
    await expect(service.cancelar('venta-1', { motivo: 'Error' })).rejects.toThrow('devoluciones');
    expect(ventas.save).not.toHaveBeenCalled();
  });

  it('una venta con factura rechazada (sin validez ante la DIAN) sí se puede cancelar', async () => {
    documentos.findOne.mockResolvedValue({ estado: EstadoDocumentoElectronico.RECHAZADO });
    await service.cancelar('venta-1', { motivo: 'Error' });
    expect(ventas.save).toHaveBeenCalledWith(expect.objectContaining({ estado: 'CANCELADA' }));
  });

  it('registra la anulación en la auditoría dentro de la misma transacción', async () => {
    venta.total = '25000.00';
    venta.numeroComprobante = 'R-15';
    await service.cancelar('venta-1', { motivo: 'Cliente se arrepintió' });
    expect(auditoria.registrarAccion).toHaveBeenCalledWith(
      expect.objectContaining({
        manager,
        accion: 'ANULAR',
        entidad: 'Venta',
        entidadId: 'venta-1',
        etiqueta: 'Venta R-15',
        descripcion: 'Anuló la venta R-15 por $25.000 — motivo: Cliente se arrepintió',
      }),
    );
  });

  it('si la cancelación falla no registra nada', async () => {
    venta.estadoDevolucion = 'PARCIAL';
    await expect(service.cancelar('venta-1', { motivo: 'Error' })).rejects.toThrow();
    expect(auditoria.registrarAccion).not.toHaveBeenCalled();
  });
});
