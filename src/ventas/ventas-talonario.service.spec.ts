import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { VentasService } from './ventas.service';
import { Venta } from './entities/venta.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
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
import { CreateVentaDto } from './dto/create-venta.dto';

/** Fase 6a: registro de una factura de talonario escrita a mano durante una contingencia. */
describe('VentasService — transcripción de talonario', () => {
  let service: VentasService;
  let politica: { estado: jest.Mock };
  let contingencia: { validarTalonario: jest.Mock };
  const DTO_CONTADO = {
    sucursalId: 'suc-1',
    bodegaId: 'bod-1',
    items: [{ productoId: 'prod-1', cantidad: 1 }],
    pagos: [{ metodoPago: 'Efectivo', monto: 10000 }],
  } as unknown as CreateVentaDto;

  beforeEach(async () => {
    politica = { estado: jest.fn().mockResolvedValue({ modo: 'ELECTRONICA' }) };
    contingencia = { validarTalonario: jest.fn().mockResolvedValue({ id: 'per-1' }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        VentasService,
        { provide: getRepositoryToken(Venta), useValue: {} },
        { provide: getRepositoryToken(Inventario), useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: CajaService, useValue: {} },
        { provide: ClientesService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: PermisosService, useValue: {} },
        { provide: AlertasService, useValue: {} },
        { provide: RealtimeGateway, useValue: {} },
        { provide: MetodosPagoService, useValue: {} },
        { provide: NumeracionComprobanteService, useValue: {} },
        { provide: PromocionesPricingService, useValue: {} },
        { provide: CuponValidacionService, useValue: {} },
        { provide: FacturacionElectronicaService, useValue: {} },
        { provide: PoliticaFacturacionService, useValue: politica },
        { provide: ContingenciaService, useValue: contingencia },
        { provide: ClsService, useValue: { get: (k: string) => (k === 'negocioId' ? 'neg-1' : 'usr-1') } },
      ],
    }).compile();
    service = moduleRef.get(VentasService);
  });

  it('valida el número y pasa número, fecha y período del papel a la creación de la venta', async () => {
    const crear = jest
      .spyOn(service as unknown as { crearConOpciones: () => Promise<unknown> }, 'crearConOpciones')
      .mockResolvedValue({ id: 'v-1' });

    await service.transcribirTalonario({ venta: DTO_CONTADO, talonario: { numero: 12, fecha: '2026-09-28T15:00:00Z' } });

    const fecha = new Date('2026-09-28T15:00:00Z');
    expect(contingencia.validarTalonario).toHaveBeenCalledWith('neg-1', 12, fecha);
    expect(crear).toHaveBeenCalledWith(DTO_CONTADO, { talonario: { numero: 12, fecha, periodoId: 'per-1' } });
  });

  it('fuera del modo ELECTRONICA es 400 y no valida nada', async () => {
    politica.estado.mockResolvedValue({ modo: 'RECIBO' });
    await expect(
      service.transcribirTalonario({ venta: DTO_CONTADO, talonario: { numero: 12, fecha: '2026-09-28T15:00:00Z' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(contingencia.validarTalonario).not.toHaveBeenCalled();
  });

  it('si el talonario no es válido, no crea la venta', async () => {
    contingencia.validarTalonario.mockRejectedValue(new BadRequestException('fuera del rango'));
    const crear = jest.spyOn(service as unknown as { crearConOpciones: () => Promise<unknown> }, 'crearConOpciones');
    await expect(
      service.transcribirTalonario({ venta: DTO_CONTADO, talonario: { numero: 99999, fecha: '2026-09-28T15:00:00Z' } }),
    ).rejects.toThrow('fuera del rango');
    expect(crear).not.toHaveBeenCalled();
  });
});
