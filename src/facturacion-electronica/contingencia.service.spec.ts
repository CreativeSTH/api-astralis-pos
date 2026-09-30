import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContingenciaService, UMBRAL_CONTINGENCIA_AUTOMATICA_MS } from './contingencia.service';
import { HabilitacionFacturacionElectronica } from './entities/habilitacion-facturacion-electronica.entity';
import { PeriodoContingencia } from './entities/periodo-contingencia.entity';
import { DocumentoElectronico } from './entities/documento-electronico.entity';
import { EstadoHabilitacion } from './entities/estado-habilitacion.enum';
import { Alerta } from '../alertas/entities/alerta.entity';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TipoAlerta } from '../common/enums/alerta.enum';
import { ReservaContingencia } from './entities/reserva-contingencia.entity';
import { Negocio } from '../negocios/entities/negocio.entity';

const RESOLUCION_CONTINGENCIA = {
  contingenciaResolucionNumero: '18764000009999', contingenciaPrefijo: 'CONT',
  contingenciaFechaInicio: '2026-01-01', contingenciaFechaFin: '2028-01-01',
  contingenciaRangoDesde: 1, contingenciaRangoHasta: 5000, contingenciaSiguienteNumero: 1,
};

function habilitacion(overrides: Partial<HabilitacionFacturacionElectronica> = {}) {
  return {
    negocioId: 'neg-1', estado: EstadoHabilitacion.HABILITADO, resolucionPrefijo: 'DE',
    alegraNoDisponibleDesde: null, ...RESOLUCION_CONTINGENCIA, ...overrides,
  } as HabilitacionFacturacionElectronica;
}

describe('ContingenciaService', () => {
  let service: ContingenciaService;
  let habilitacionRepo: { findOne: jest.Mock; save: jest.Mock; manager: { transaction: jest.Mock } };
  let periodosRepo: { findOne: jest.Mock; find: jest.Mock; create: jest.Mock; save: jest.Mock };
  let documentosRepo: { count: jest.Mock; createQueryBuilder: jest.Mock };
  let alertasRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let realtime: { emitToNegocio: jest.Mock };
  let manager: { findOne: jest.Mock; count: jest.Mock; save: jest.Mock };
  let reservas: { create: jest.Mock };
  let negocios: { findOne: jest.Mock };

  beforeEach(async () => {
    manager = { findOne: jest.fn(), count: jest.fn().mockResolvedValue(0), save: jest.fn(async (_e, x) => x) };
    habilitacionRepo = {
      findOne: jest.fn().mockResolvedValue(habilitacion()),
      save: jest.fn(async (x) => x),
      manager: { transaction: jest.fn(async (cb) => cb(manager)) },
    };
    periodosRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'per-1', ...x })),
    };
    const qb = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getCount: jest.fn().mockResolvedValue(0) };
    documentosRepo = { count: jest.fn().mockResolvedValue(0), createQueryBuilder: jest.fn().mockReturnValue(qb) };
    alertasRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
    realtime = { emitToNegocio: jest.fn() };
    reservas = { create: jest.fn((x) => x) };
    negocios = { findOne: jest.fn().mockResolvedValue({ id: 'neg-1', nombre: 'Tienda', nit: '900123456', direccion: 'Cra 1' }) };

    const modulo = await Test.createTestingModule({
      providers: [
        ContingenciaService,
        { provide: getRepositoryToken(HabilitacionFacturacionElectronica), useValue: habilitacionRepo },
        { provide: getRepositoryToken(PeriodoContingencia), useValue: periodosRepo },
        { provide: getRepositoryToken(DocumentoElectronico), useValue: documentosRepo },
        { provide: getRepositoryToken(Alerta), useValue: alertasRepo },
        { provide: RealtimeGateway, useValue: realtime },
        { provide: getRepositoryToken(ReservaContingencia), useValue: reservas },
        { provide: getRepositoryToken(Negocio), useValue: negocios },
      ],
    }).compile();
    service = modulo.get(ContingenciaService);
  });

  describe('cargarResolucion', () => {
    const DTO = { numero: '18764000009999', prefijo: 'CONT', fechaInicio: '2026-01-01', fechaFin: '2028-01-01', rangoDesde: 1, rangoHasta: 5000 };

    it('exige la facturación electrónica habilitada', async () => {
      habilitacionRepo.findOne.mockResolvedValue(habilitacion({ estado: EstadoHabilitacion.DATOS_NEGOCIO }));
      await expect(service.cargarResolucion('neg-1', DTO)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza el mismo prefijo de la factura electrónica', async () => {
      await expect(service.cargarResolucion('neg-1', { ...DTO, prefijo: 'de' })).rejects.toThrow('prefijo distinto');
    });

    it('rechaza rango o fechas invertidos', async () => {
      await expect(service.cargarResolucion('neg-1', { ...DTO, rangoDesde: 10, rangoHasta: 5 })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.cargarResolucion('neg-1', { ...DTO, fechaFin: '2025-01-01' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('no deja cambiarla con una contingencia abierta', async () => {
      periodosRepo.findOne.mockResolvedValue({ id: 'per-1', fin: null });
      await expect(service.cargarResolucion('neg-1', { ...DTO, numero: '1' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('una resolución nueva reinicia el siguiente número al inicio del rango', async () => {
      habilitacionRepo.findOne.mockResolvedValue(habilitacion({ contingenciaResolucionNumero: null, contingenciaSiguienteNumero: null }));
      await service.cargarResolucion('neg-1', { ...DTO, rangoDesde: 100 });
      expect(habilitacionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        contingenciaPrefijo: 'CONT', contingenciaRangoDesde: 100, contingenciaSiguienteNumero: 100,
      }));
    });

    it('reenviar la misma resolución (p. ej. corregir la fecha fin) no reinicia el consecutivo', async () => {
      habilitacionRepo.findOne.mockResolvedValue(habilitacion({ contingenciaSiguienteNumero: 37 }));
      await service.cargarResolucion('neg-1', { ...DTO, fechaFin: '2028-06-01' });
      expect(habilitacionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ contingenciaSiguienteNumero: 37 }));
    });
  });

  describe('declarar / finalizar', () => {
    it('declarar exige resolución de contingencia cargada', async () => {
      habilitacionRepo.findOne.mockResolvedValue(habilitacion({ contingenciaResolucionNumero: null }));
      await expect(service.declarar('neg-1', 'u-1', { motivo: 'Sin internet' })).rejects.toThrow('resolución de contingencia');
    });

    it('no deja abrir dos a la vez', async () => {
      periodosRepo.findOne.mockResolvedValue({ id: 'per-1', fin: null });
      await expect(service.declarar('neg-1', 'u-1', { motivo: 'x' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('rechaza un inicio en el futuro', async () => {
      const futuro = new Date(Date.now() + 60_000).toISOString();
      await expect(service.declarar('neg-1', 'u-1', { motivo: 'x', inicio: futuro })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('declara MANUAL, avisa por realtime', async () => {
      const periodo = await service.declarar('neg-1', 'u-1', { motivo: 'Sin internet' });
      expect(periodo).toEqual(expect.objectContaining({ negocioId: 'neg-1', origen: 'MANUAL', declaradoPor: 'u-1', fin: null }));
      expect(realtime.emitToNegocio).toHaveBeenCalledWith('neg-1', 'contingencia:cambio', expect.objectContaining({ origen: 'MANUAL' }));
    });

    it('finalizar sin período abierto es 404', async () => {
      await expect(service.finalizar('neg-1', 'u-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('finalizar cierra, limpia la racha de indisponibilidad y avisa con null', async () => {
      const inicio = new Date(Date.now() - 3_600_000);
      periodosRepo.findOne.mockResolvedValue({ id: 'per-1', negocioId: 'neg-1', inicio, fin: null });
      habilitacionRepo.findOne.mockResolvedValue(habilitacion({ alegraNoDisponibleDesde: inicio }));
      const cerrado = await service.finalizar('neg-1', 'u-1');
      expect(cerrado.fin).toBeInstanceOf(Date);
      expect(cerrado.finalizadoPor).toBe('u-1');
      expect(habilitacionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ alegraNoDisponibleDesde: null }));
      expect(realtime.emitToNegocio).toHaveBeenCalledWith('neg-1', 'contingencia:cambio', null);
    });

    it('finalizar rechaza un fin anterior al inicio', async () => {
      periodosRepo.findOne.mockResolvedValue({ id: 'per-1', negocioId: 'neg-1', inicio: new Date(), fin: null });
      await expect(service.finalizar('neg-1', 'u-1', { fin: '2020-01-01T00:00:00Z' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('registrarIndisponibilidad', () => {
    it('la primera falla solo anota el inicio de la racha', async () => {
      const h = habilitacion();
      await service.registrarIndisponibilidad(h);
      expect(h.alegraNoDisponibleDesde).toBeInstanceOf(Date);
      expect(periodosRepo.save).not.toHaveBeenCalled();
    });

    it('antes del umbral no abre período', async () => {
      const h = habilitacion({ alegraNoDisponibleDesde: new Date(Date.now() - UMBRAL_CONTINGENCIA_AUTOMATICA_MS + 30_000) });
      await service.registrarIndisponibilidad(h);
      expect(periodosRepo.save).not.toHaveBeenCalled();
    });

    it('pasado el umbral abre un período AUTOMATICA desde el inicio de la racha y crea alerta crítica', async () => {
      const desde = new Date(Date.now() - UMBRAL_CONTINGENCIA_AUTOMATICA_MS - 1000);
      await service.registrarIndisponibilidad(habilitacion({ alegraNoDisponibleDesde: desde }));
      expect(periodosRepo.save).toHaveBeenCalledWith(expect.objectContaining({ origen: 'AUTOMATICA', inicio: desde, declaradoPor: null }));
      expect(alertasRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tipo: TipoAlerta.CONTINGENCIA_FACTURACION }));
      expect(realtime.emitToNegocio).toHaveBeenCalledWith('neg-1', 'contingencia:cambio', expect.anything());
    });

    it('sin resolución de contingencia no abre (no hay numeración para el papel)', async () => {
      const desde = new Date(Date.now() - UMBRAL_CONTINGENCIA_AUTOMATICA_MS - 1000);
      await service.registrarIndisponibilidad(habilitacion({ alegraNoDisponibleDesde: desde, contingenciaResolucionNumero: null }));
      expect(periodosRepo.save).not.toHaveBeenCalled();
    });

    it('con un período ya abierto no abre otro', async () => {
      periodosRepo.findOne.mockResolvedValue({ id: 'per-1', fin: null });
      const desde = new Date(Date.now() - UMBRAL_CONTINGENCIA_AUTOMATICA_MS - 1000);
      await service.registrarIndisponibilidad(habilitacion({ alegraNoDisponibleDesde: desde }));
      expect(periodosRepo.save).not.toHaveBeenCalled();
    });

    it('registrarDisponibilidad corta la racha', async () => {
      const h = habilitacion({ alegraNoDisponibleDesde: new Date() });
      await service.registrarDisponibilidad(h);
      expect(h.alegraNoDisponibleDesde).toBeNull();
      expect(habilitacionRepo.save).toHaveBeenCalled();
    });
  });

  describe('asignarNumero', () => {
    it('toma el siguiente con lock y lo avanza', async () => {
      manager.findOne.mockResolvedValue(habilitacion({ contingenciaSiguienteNumero: 7 }));
      const { numero } = await service.asignarNumero('neg-1');
      expect(numero).toBe(7);
      expect(manager.findOne).toHaveBeenCalledWith(HabilitacionFacturacionElectronica, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
      expect(manager.save).toHaveBeenCalledWith(HabilitacionFacturacionElectronica, expect.objectContaining({ contingenciaSiguienteNumero: 8 }));
    });

    it('salta números ya usados por una transcripción de talonario', async () => {
      manager.findOne.mockResolvedValue(habilitacion({ contingenciaSiguienteNumero: 7 }));
      manager.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      const { numero } = await service.asignarNumero('neg-1');
      expect(numero).toBe(8);
    });

    it('rango agotado es error', async () => {
      manager.findOne.mockResolvedValue(habilitacion({ contingenciaSiguienteNumero: 5001 }));
      await expect(service.asignarNumero('neg-1')).rejects.toThrow('Se agotó la numeración de contingencia');
    });
  });

  describe('validarTalonario', () => {
    const fecha = new Date(Date.now() - 3_600_000);

    it('fuera de rango', async () => {
      await expect(service.validarTalonario('neg-1', 9999, fecha)).rejects.toThrow('fuera del rango');
    });

    it('número ya registrado', async () => {
      documentosRepo.count.mockResolvedValue(1);
      await expect(service.validarTalonario('neg-1', 10, fecha)).rejects.toBeInstanceOf(ConflictException);
    });

    it('fecha fuera de todo período', async () => {
      await expect(service.validarTalonario('neg-1', 10, fecha)).rejects.toThrow('período de contingencia');
    });

    it('devuelve el período que cubre la fecha', async () => {
      periodosRepo.findOne.mockResolvedValue({ id: 'per-1', inicio: new Date(0), fin: null });
      await expect(service.validarTalonario('neg-1', 10, fecha)).resolves.toEqual(expect.objectContaining({ id: 'per-1' }));
    });
  });

  describe('fase 6b', () => {
    describe('reservarBloque', () => {
      it('reserva 50 números desde el siguiente libre, avanza el consecutivo y devuelve la resolución vigente', async () => {
        manager.findOne.mockResolvedValue(habilitacion({ contingenciaSiguienteNumero: 7 }));
        const bloque = await service.reservarBloque('neg-1', 'term-1');
        expect(bloque).toEqual({
          desde: 7,
          hasta: 56,
          resolucion: { numero: '18764000009999', prefijo: 'CONT', fechaInicio: '2026-01-01', fechaFin: '2028-01-01', rangoDesde: 1, rangoHasta: 5000 },
        });
        expect(manager.save).toHaveBeenCalledWith(HabilitacionFacturacionElectronica, expect.objectContaining({ contingenciaSiguienteNumero: 57 }));
        expect(manager.save).toHaveBeenCalledWith(
          ReservaContingencia,
          expect.objectContaining({ terminalId: 'term-1', desde: 7, hasta: 56, prefijo: 'CONT' }),
        );
      });

      it('recorta el bloque al final del rango', async () => {
        manager.findOne.mockResolvedValue(habilitacion({ contingenciaSiguienteNumero: 4990 }));
        expect((await service.reservarBloque('neg-1', 'term-1')).hasta).toBe(5000);
      });

      it('rango agotado es error', async () => {
        manager.findOne.mockResolvedValue(habilitacion({ contingenciaSiguienteNumero: 5001 }));
        await expect(service.reservarBloque('neg-1', 'term-1')).rejects.toThrow('Se agotó la numeración de contingencia');
      });

      it('sin resolución de contingencia es error', async () => {
        manager.findOne.mockResolvedValue(habilitacion({ contingenciaResolucionNumero: null }));
        await expect(service.reservarBloque('neg-1', 'term-1')).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    describe('asegurarPeriodoSinConexion', () => {
      const EPISODIO = { id: 'ep-1', inicio: '2026-09-29T15:00:00.000Z', fin: '2026-09-29T17:00:00.000Z' };

      it('si ya existe el período del episodio, lo devuelve', async () => {
        periodosRepo.findOne.mockResolvedValueOnce({ id: 'per-ep', episodioId: 'ep-1' });
        await expect(service.asegurarPeriodoSinConexion('neg-1', EPISODIO)).resolves.toEqual(expect.objectContaining({ id: 'per-ep' }));
        expect(periodosRepo.save).not.toHaveBeenCalled();
      });

      it('si otro período ya cubre el episodio, usa ese', async () => {
        periodosRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'per-manual' });
        await expect(service.asegurarPeriodoSinConexion('neg-1', EPISODIO)).resolves.toEqual(expect.objectContaining({ id: 'per-manual' }));
        expect(periodosRepo.save).not.toHaveBeenCalled();
      });

      it('si no, crea un período SIN_CONEXION cerrado con inicio y fin del episodio y avisa', async () => {
        periodosRepo.findOne.mockResolvedValue(null);
        const periodo = await service.asegurarPeriodoSinConexion('neg-1', EPISODIO);
        expect(periodo).toEqual(
          expect.objectContaining({
            origen: 'SIN_CONEXION',
            episodioId: 'ep-1',
            inicio: new Date(EPISODIO.inicio),
            fin: new Date(EPISODIO.fin),
          }),
        );
        expect(alertasRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tipo: TipoAlerta.CONTINGENCIA_FACTURACION }));
      });
    });

    it('datosSinConexion: emisor del negocio (nunca AURA), fabricante y resolución vigente', async () => {
      process.env.AURA_FABRICANTE_NOMBRE = 'Sebastian Torres';
      process.env.AURA_FABRICANTE_NIT = '1047444002-2';
      habilitacionRepo.findOne.mockResolvedValue(
        habilitacion({ razonSocial: 'Tienda S.A.S.', direccion: 'Cra 1', ciudad: 'Medellín', ambiente: 'PRODUCCION' }),
      );
      const datos = await service.datosSinConexion('neg-1');
      expect(datos.negocio).toEqual({ nombre: 'Tienda', nit: '900123456' });
      expect(datos.ambiente).toBe('PRODUCCION');
      expect(datos.emisor).toEqual({ razonSocial: 'Tienda S.A.S.', nitConDv: expect.stringMatching(/^900123456-/), direccion: 'Cra 1, Medellín' });
      expect(datos.fabricanteSoftware).toContain('Sebastian Torres');
      expect(datos.proveedorTecnologico).toContain('Alegra');
      expect(datos.resolucion).toEqual(expect.objectContaining({ prefijo: 'CONT' }));
      delete process.env.AURA_FABRICANTE_NOMBRE;
      delete process.env.AURA_FABRICANTE_NIT;
    });
  });
});
