import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TopeUvtService } from './tope-uvt.service';
import { PoliticaFacturacionService } from './politica-facturacion.service';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { Alerta } from '../alertas/entities/alerta.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { EmailService } from '../email/email.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  OrigenObligacion,
  ResponsabilidadIva,
  TipoPersona,
} from '../negocios/entities/perfil-fiscal.enum';
import { TipoAlerta, SeveridadAlerta } from '../common/enums/alerta.enum';
import { EstadoVenta } from '../common/enums/venta.enum';
import {
  inicioDiaColombia,
  finDiaColombia,
} from '../common/utils/fecha-colombia';

const AHORA = new Date('2026-09-29T15:00:00Z');

describe('TopeUvtService', () => {
  let service: TopeUvtService;
  let negocios: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock };
  let ventas: { query: jest.Mock };
  let alertas: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let usuarios: { findOne: jest.Mock };
  let politica: { estado: jest.Mock };
  let email: { enviar: jest.Mock };
  let realtime: { emitToNegocio: jest.Mock };
  let negocio: Negocio;

  const ingresos = (actual: number, anterior: number) =>
    ventas.query.mockResolvedValue([
      { actual: actual.toFixed(2), anterior: anterior.toFixed(2) },
    ]);

  beforeEach(async () => {
    negocio = {
      id: 'neg-1',
      tipoPersona: TipoPersona.NATURAL,
      responsabilidadIva: ResponsabilidadIva.NO_RESPONSABLE,
      obligadoDesde: null,
      origenObligacion: null,
      avisoTopeUvtNivel: null,
      avisoTopeUvtAnio: null,
    } as Negocio;
    negocios = {
      find: jest.fn(async () => [negocio]),
      findOne: jest.fn(async () => negocio),
      save: jest.fn(async (n) => n),
    };
    ventas = { query: jest.fn() };
    alertas = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (a) => ({ id: 'al-1', ...a })),
      create: jest.fn((a) => a),
    };
    usuarios = {
      findOne: jest.fn().mockResolvedValue({ email: 'dueno@negocio.co' }),
    };
    politica = {
      estado: jest
        .fn()
        .mockResolvedValue({ modo: 'GRACIA', fechaLimiteGracia: '2026-11-07' }),
    };
    email = { enviar: jest.fn().mockResolvedValue(undefined) };
    realtime = { emitToNegocio: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TopeUvtService,
        { provide: getRepositoryToken(Negocio), useValue: negocios },
        { provide: getRepositoryToken(Venta), useValue: ventas },
        { provide: getRepositoryToken(Alerta), useValue: alertas },
        { provide: getRepositoryToken(Usuario), useValue: usuarios },
        { provide: PoliticaFacturacionService, useValue: politica },
        { provide: EmailService, useValue: email },
        { provide: RealtimeGateway, useValue: realtime },
      ],
    }).compile();
    service = moduleRef.get(TopeUvtService);
  });

  it('suma ingresos sin IVA ni canceladas, año en curso y anterior en calendario Colombia', async () => {
    ingresos(0, 0);
    await service.evaluarNegocio(negocio, AHORA);
    const [sql, params] = ventas.query.mock.calls[0];
    expect(sql).toContain('v.total - v.impuesto_total');
    expect(params).toEqual([
      'neg-1',
      EstadoVenta.CANCELADA,
      inicioDiaColombia('2026-01-01'),
      inicioDiaColombia('2025-01-01'),
      finDiaColombia('2026-12-31'),
    ]);
  });

  it('bajo el 70 % no hace nada', async () => {
    ingresos(100_000_000, 0); // ≈ 54,6 %
    await service.evaluarNegocio(negocio, AHORA);
    expect(negocios.save).not.toHaveBeenCalled();
    expect(email.enviar).not.toHaveBeenCalled();
  });

  it('72 % → correo al primer usuario activo, alerta MEDIA del año y nivel 70 guardado', async () => {
    ingresos(132_000_000, 0);
    await service.evaluarNegocio(negocio, AHORA);
    expect(negocios.save).toHaveBeenCalledWith(
      expect.objectContaining({
        avisoTopeUvtNivel: 70,
        avisoTopeUvtAnio: 2026,
        obligadoDesde: null,
      }),
    );
    expect(usuarios.findOne).toHaveBeenCalledWith({
      where: { negocioId: 'neg-1', activo: true },
      order: { createdAt: 'ASC' },
    });
    expect(email.enviar).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'dueno@negocio.co',
        subject: expect.stringContaining('72%'),
      }),
    );
    expect(alertas.create).toHaveBeenCalledWith(
      expect.objectContaining({
        negocioId: 'neg-1',
        tipo: TipoAlerta.TOPE_FACTURACION,
        referenciaId: '2026',
        severidad: SeveridadAlerta.MEDIA,
      }),
    );
    expect(realtime.emitToNegocio).toHaveBeenCalledWith(
      'neg-1',
      'alertas:cambio',
      expect.anything(),
    );
    expect(realtime.emitToNegocio).not.toHaveBeenCalledWith(
      'neg-1',
      'politica-facturacion:cambio',
      expect.anything(),
    );
  });

  it('70 ya avisado este año → no repite', async () => {
    negocio.avisoTopeUvtNivel = 70;
    negocio.avisoTopeUvtAnio = 2026;
    ingresos(132_000_000, 0);
    await service.evaluarNegocio(negocio, AHORA);
    expect(email.enviar).not.toHaveBeenCalled();
    expect(negocios.save).not.toHaveBeenCalled();
  });

  it('90 % actualiza la alerta del 70 sin resolver (misma fila) a ALTA', async () => {
    negocio.avisoTopeUvtNivel = 70;
    negocio.avisoTopeUvtAnio = 2026;
    alertas.findOne.mockResolvedValue({
      id: 'al-70',
      severidad: SeveridadAlerta.MEDIA,
      mensaje: 'viejo',
    });
    ingresos(170_000_000, 0); // ≈ 92,7 %
    await service.evaluarNegocio(negocio, AHORA);
    expect(alertas.findOne).toHaveBeenCalledWith({
      where: {
        negocioId: 'neg-1',
        tipo: TipoAlerta.TOPE_FACTURACION,
        referenciaId: '2026',
        resuelta: false,
      },
    });
    expect(alertas.create).not.toHaveBeenCalled();
    expect(alertas.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'al-70', severidad: SeveridadAlerta.ALTA }),
    );
  });

  it('supera el tope → obligado desde ahora por TOPE_UVT, evento de política, aviso CRITICO con la fecha límite', async () => {
    ingresos(190_000_000, 0);
    await service.evaluarNegocio(negocio, AHORA);
    expect(negocios.save).toHaveBeenCalledWith(
      expect.objectContaining({
        obligadoDesde: AHORA,
        origenObligacion: OrigenObligacion.TOPE_UVT,
        avisoTopeUvtNivel: 100,
        avisoTopeUvtAnio: 2026,
      }),
    );
    expect(realtime.emitToNegocio).toHaveBeenCalledWith(
      'neg-1',
      'politica-facturacion:cambio',
      {},
    );
    expect(politica.estado).toHaveBeenCalledWith('neg-1');
    expect(email.enviar).toHaveBeenCalledWith(
      expect.objectContaining({
        subject:
          'Superaste el tope de 3.500 UVT: debes facturar electrónicamente',
      }),
    );
    expect(alertas.create).toHaveBeenCalledWith(
      expect.objectContaining({
        severidad: SeveridadAlerta.CRITICA,
        mensaje: expect.stringContaining('7 de noviembre de 2026'),
      }),
    );
  });

  it('supera el tope ya facturando electrónicamente en producción → aviso MEDIA "no tienes que hacer nada más"', async () => {
    politica.estado.mockResolvedValue({
      modo: 'ELECTRONICA',
      fechaLimiteGracia: null,
    });
    ingresos(190_000_000, 0);
    await service.evaluarNegocio(negocio, AHORA);
    expect(alertas.create).toHaveBeenCalledWith(
      expect.objectContaining({
        severidad: SeveridadAlerta.MEDIA,
        mensaje: expect.stringContaining('no tienes que hacer nada más'),
      }),
    );
  });

  it('el año anterior sobre el tope también obliga (2 de enero, año nuevo sin ventas)', async () => {
    ingresos(0, 180_000_000); // 2025: 180M / 174,3M
    await service.evaluarNegocio(negocio, new Date('2026-01-02T15:00:00Z'));
    expect(negocios.save).toHaveBeenCalledWith(
      expect.objectContaining({ origenObligacion: OrigenObligacion.TOPE_UVT }),
    );
  });

  it('obligado por TOPE_UVT y ambos años bajo el tope → limpia la obligación y avisa el cambio de política', async () => {
    negocio.origenObligacion = OrigenObligacion.TOPE_UVT;
    negocio.obligadoDesde = new Date('2026-03-01T15:00:00Z');
    ingresos(100_000_000, 100_000_000);
    await service.evaluarNegocio(negocio, AHORA);
    expect(negocios.save).toHaveBeenCalledWith(
      expect.objectContaining({ obligadoDesde: null, origenObligacion: null }),
    );
    expect(realtime.emitToNegocio).toHaveBeenCalledWith(
      'neg-1',
      'politica-facturacion:cambio',
      {},
    );
    expect(email.enviar).not.toHaveBeenCalled();
  });

  it('año sin UVT cargada → no hace nada (nunca obliga por un dato faltante)', async () => {
    ingresos(999_000_000, 999_000_000);
    await service.evaluarNegocio(negocio, new Date('2028-06-01T15:00:00Z'));
    expect(negocios.save).not.toHaveBeenCalled();
    expect(email.enviar).not.toHaveBeenCalled();
  });

  it('si el aviso falla, la obligación ya quedó guardada y no se lanza el error', async () => {
    alertas.save.mockRejectedValue(new Error('db caída'));
    ingresos(190_000_000, 0);
    await expect(
      service.evaluarNegocio(negocio, AHORA),
    ).resolves.toBeUndefined();
    expect(negocios.save).toHaveBeenCalledWith(
      expect.objectContaining({ origenObligacion: OrigenObligacion.TOPE_UVT }),
    );
  });

  it('evaluarTodos filtra no obligados declarados activos y un error en un negocio no corta el resto', async () => {
    const otro = { ...negocio, id: 'neg-2' };
    negocios.find.mockResolvedValue([negocio, otro]);
    ventas.query
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce([{ actual: '132000000', anterior: '0' }]);
    await service.evaluarTodos(AHORA);
    expect(negocios.find).toHaveBeenCalledWith({
      where: {
        activo: true,
        tipoPersona: TipoPersona.NATURAL,
        responsabilidadIva: ResponsabilidadIva.NO_RESPONSABLE,
      },
    });
    expect(negocios.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'neg-2', avisoTopeUvtNivel: 70 }),
    );
  });

  describe('medicionActual (barra del tope)', () => {
    it('no obligado declarado: mide igual que el cron', async () => {
      ingresos(132_000_000, 0);
      const m = await service.medicionActual('neg-1', AHORA);
      expect(m).toMatchObject({ aplica: true, anio: 2026, ingresos: 132_000_000, tope: 183_309_000 });
      expect(m.porcentaje).toBeCloseTo(72.01, 1);
      expect(negocios.save).not.toHaveBeenCalled();
    });

    it('persona jurídica o responsable de IVA → no aplica, sin consultar ventas', async () => {
      negocio.tipoPersona = TipoPersona.JURIDICA;
      expect(await service.medicionActual('neg-1', AHORA)).toEqual({ aplica: false, anio: null, ingresos: 0, tope: null, porcentaje: 0 });
      expect(ventas.query).not.toHaveBeenCalled();
    });

    it('ya obligado por el tope → no aplica (ya no hay tope que vigilar)', async () => {
      negocio.origenObligacion = OrigenObligacion.TOPE_UVT;
      expect((await service.medicionActual('neg-1', AHORA)).aplica).toBe(false);
    });

    it('negocio inexistente → 404', async () => {
      negocios.findOne.mockResolvedValue(null);
      await expect(service.medicionActual('nope', AHORA)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
