import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FacturacionElectronicaService } from './facturacion-electronica.service';
import { HabilitacionFacturacionElectronica } from './entities/habilitacion-facturacion-electronica.entity';
import { DocumentoElectronico } from './entities/documento-electronico.entity';
import { EstadoHabilitacion } from './entities/estado-habilitacion.enum';
import { EstadoDocumentoElectronico } from './entities/estado-documento-electronico.enum';
import { AlegraClientService } from './alegra-client.service';
import { Negocio } from '../negocios/entities/negocio.entity';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';
import { Alerta } from '../alertas/entities/alerta.entity';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TipoAlerta } from '../common/enums/alerta.enum';

type AlegraClientMock = {
  crearCompania: jest.Mock;
  crearTestSet: jest.Mock;
  crearDocumentoEquivalentePos: jest.Mock;
  crearFactura: jest.Mock;
  crearNotaAjuste: jest.Mock;
  consultarDocumento: jest.Mock;
};

describe('FacturacionElectronicaService — wizard pasos 1-3', () => {
  let service: FacturacionElectronicaService;
  let habilitacionRepo: { findOne: jest.Mock; findOneOrFail: jest.Mock; create: jest.Mock; save: jest.Mock };
  let documentosRepo: {
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let negociosRepo: { findOneOrFail: jest.Mock };
  let alegraClient: AlegraClientMock;
  let suscripcionesService: { registrarConsumo: jest.Mock };
  let alertasRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let realtimeGateway: { emitToNegocio: jest.Mock };
  let qbWhereMock: { where: jest.Mock; andWhere: jest.Mock; getMany: jest.Mock };

  beforeEach(async () => {
    habilitacionRepo = { findOne: jest.fn(), findOneOrFail: jest.fn(), create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
    qbWhereMock = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    documentosRepo = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      createQueryBuilder: jest.fn().mockReturnValue(qbWhereMock),
    };
    negociosRepo = { findOneOrFail: jest.fn().mockResolvedValue({ nit: '900123456' }) };
    alegraClient = {
      crearCompania: jest.fn(),
      crearTestSet: jest.fn(),
      crearDocumentoEquivalentePos: jest.fn(),
      crearFactura: jest.fn(),
      crearNotaAjuste: jest.fn(),
      consultarDocumento: jest.fn(),
    };
    suscripcionesService = { registrarConsumo: jest.fn() };
    alertasRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
    realtimeGateway = { emitToNegocio: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        FacturacionElectronicaService,
        { provide: getRepositoryToken(HabilitacionFacturacionElectronica), useValue: habilitacionRepo },
        { provide: getRepositoryToken(DocumentoElectronico), useValue: documentosRepo },
        { provide: getRepositoryToken(Negocio), useValue: negociosRepo },
        { provide: getRepositoryToken(Alerta), useValue: alertasRepo },
        { provide: AlegraClientService, useValue: alegraClient },
        { provide: SuscripcionesService, useValue: suscripcionesService },
        { provide: RealtimeGateway, useValue: realtimeGateway },
      ],
    }).compile();

    service = moduleRef.get(FacturacionElectronicaService);
  });

  it('obtenerOCrearHabilitacion crea una nueva en DATOS_NEGOCIO si no existe', async () => {
    habilitacionRepo.findOne.mockResolvedValue(null);
    await service.obtenerOCrearHabilitacion('neg-1');
    expect(habilitacionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ negocioId: 'neg-1', estado: EstadoHabilitacion.DATOS_NEGOCIO }),
    );
  });

  it('cargarResolucion llama a Alegra con el NIT real del negocio y avanza a RESOLUCION_CARGADA', async () => {
    habilitacionRepo.findOne.mockResolvedValue({
      negocioId: 'neg-1',
      estado: EstadoHabilitacion.ESPERANDO_TRAMITE_DIAN,
      razonSocial: 'Mascotas Pet Shop',
      direccion: 'Calle 1',
      ciudad: 'Bogotá',
      useAlegraCertificate: true,
    });
    alegraClient.crearCompania.mockResolvedValue({ companyId: 'company-1' });

    const resultado = await service.cargarResolucion('neg-1', {
      numero: '18760000001',
      prefijo: 'DE',
      fechaInicio: '2026-01-01',
      fechaFin: '2027-01-01',
      rangoDesde: 1,
      rangoHasta: 100000,
      technicalKey: 'abc123',
    });

    expect(negociosRepo.findOneOrFail).toHaveBeenCalledWith({ where: { id: 'neg-1' } });
    expect(alegraClient.crearCompania).toHaveBeenCalledWith(expect.objectContaining({ nit: '900123456' }));
    expect(resultado.estado).toBe(EstadoHabilitacion.RESOLUCION_CARGADA);
    expect(resultado.alegraCompanyId).toBe('company-1');
    expect(resultado.siguienteNumero).toBe(1);
  });

  it('cargarResolucion rechaza si todavía no se completaron los pasos anteriores', async () => {
    habilitacionRepo.findOne.mockResolvedValue({
      negocioId: 'neg-1',
      estado: EstadoHabilitacion.DATOS_NEGOCIO,
    });

    await expect(
      service.cargarResolucion('neg-1', {
        numero: '1',
        prefijo: 'DE',
        fechaInicio: '2026-01-01',
        fechaFin: '2027-01-01',
        rangoDesde: 1,
        rangoHasta: 100,
        technicalKey: 'k',
      }),
    ).rejects.toThrow();
  });

  describe('confirmarTestSet', () => {
    it('emite 2 DEE-POS + 1 nota de ajuste de prueba y pasa a HABILITADO', async () => {
      habilitacionRepo.findOne.mockResolvedValue({
        negocioId: 'neg-1',
        estado: EstadoHabilitacion.RESOLUCION_CARGADA,
        alegraCompanyId: 'company-1',
        resolucionRangoDesde: 1,
        siguienteNumero: 1,
        ambiente: 'SANDBOX',
      });
      alegraClient.crearTestSet.mockResolvedValue({ testSetId: 'testset-1' });
      alegraClient.crearDocumentoEquivalentePos.mockResolvedValue({ alegraDocumentId: 'doc-1', status: 'REGISTERED' });
      alegraClient.crearNotaAjuste.mockResolvedValue({ alegraDocumentId: 'nota-1', status: 'REGISTERED' });

      const resultado = await service.confirmarTestSet('neg-1');

      expect(alegraClient.crearDocumentoEquivalentePos).toHaveBeenCalledTimes(2);
      expect(alegraClient.crearNotaAjuste).toHaveBeenCalledTimes(1);
      expect(resultado.estado).toBe(EstadoHabilitacion.HABILITADO);
      expect(resultado.ambiente).toBe('PRODUCCION');
    });

    it('deja el estado en ERROR con el mensaje si Alegra rechaza el testset', async () => {
      habilitacionRepo.findOne.mockResolvedValue({
        negocioId: 'neg-1',
        estado: EstadoHabilitacion.RESOLUCION_CARGADA,
        alegraCompanyId: 'company-1',
        resolucionRangoDesde: 1,
        siguienteNumero: 1,
        ambiente: 'SANDBOX',
      });
      alegraClient.crearTestSet.mockRejectedValue(new Error('testset rechazado'));

      const resultado = await service.confirmarTestSet('neg-1');

      expect(resultado.estado).toBe(EstadoHabilitacion.ERROR);
      expect(resultado.errorMensaje).toBe('testset rechazado');
    });
  });

  describe('emitirDocumento — fail-closed', () => {
    it('no crea DocumentoElectronico si el negocio no está HABILITADO', async () => {
      habilitacionRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', estado: EstadoHabilitacion.RESOLUCION_CARGADA });

      await service.emitirDocumento({ id: 'venta-1', negocioId: 'neg-1', tipoComprobanteEmitido: 'RECIBO' } as any);

      expect(documentosRepo.save).not.toHaveBeenCalled();
    });

    it('crea el documento en PENDIENTE y llama a intentarEmitir si el negocio está HABILITADO', async () => {
      habilitacionRepo.findOne.mockResolvedValue({
        negocioId: 'neg-1',
        estado: EstadoHabilitacion.HABILITADO,
        alegraCompanyId: 'company-1',
        siguienteNumero: 5,
        ambiente: 'PRODUCCION',
      });
      alegraClient.crearDocumentoEquivalentePos.mockResolvedValue({
        alegraDocumentId: 'doc-9',
        cude: 'cude-9',
        status: 'REGISTERED',
        legalStatus: 'ACCEPTED',
      });

      await service.emitirDocumento({ id: 'venta-1', negocioId: 'neg-1', tipoComprobanteEmitido: 'RECIBO' } as any);

      expect(documentosRepo.save).toHaveBeenCalled();
      const documentoGuardado = documentosRepo.save.mock.calls.at(-1)![0];
      expect(documentoGuardado.estado).toBe(EstadoDocumentoElectronico.ACEPTADO);
      expect(documentoGuardado.cude).toBe('cude-9');
      expect(suscripcionesService.registrarConsumo).toHaveBeenCalledWith('neg-1', 'documentosDianPorMes');
    });
  });

  describe('intentarEmitir — numeración correlativa real', () => {
    it('usa habilitacion.siguienteNumero (no documento.intentos) y lo avanza tras un envío exitoso', async () => {
      const documento = {
        id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'DEE_POS' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 7, // deliberadamente distinto de siguienteNumero
      };
      const habilitacion = {
        negocioId: 'neg-1', estado: EstadoHabilitacion.HABILITADO, alegraCompanyId: 'company-1',
        siguienteNumero: 42, ambiente: 'PRODUCCION' as const,
      };
      alegraClient.crearDocumentoEquivalentePos.mockResolvedValue({
        alegraDocumentId: 'doc-42', status: 'REGISTERED', legalStatus: 'ACCEPTED',
      });

      await service.intentarEmitir(documento as any, habilitacion as any);

      expect(alegraClient.crearDocumentoEquivalentePos).toHaveBeenCalledWith(
        expect.objectContaining({ number: 42 }),
      );
      expect(habilitacion.siguienteNumero).toBe(43);
      expect(habilitacionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ siguienteNumero: 43 }));
    });

    it('no avanza siguienteNumero si la llamada a Alegra falla (no se consumió el número)', async () => {
      const documento = {
        id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'DEE_POS' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0,
      };
      const habilitacion = {
        negocioId: 'neg-1', estado: EstadoHabilitacion.HABILITADO, alegraCompanyId: 'company-1',
        siguienteNumero: 10, ambiente: 'PRODUCCION' as const,
      };
      alegraClient.crearDocumentoEquivalentePos.mockRejectedValue(new Error('timeout'));

      await service.intentarEmitir(documento as any, habilitacion as any);

      expect(habilitacion.siguienteNumero).toBe(10);
      expect(habilitacionRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('procesarWebhookAlegra', () => {
    it('ignora un payload sin documentId', async () => {
      await service.procesarWebhookAlegra({});
      expect(documentosRepo.findOne).not.toHaveBeenCalled();
    });

    it('marca ACEPTADO y registra consumo cuando legalStatus es ACCEPTED', async () => {
      documentosRepo.findOne.mockResolvedValue({
        id: 'doc-1', negocioId: 'neg-1', estado: EstadoDocumentoElectronico.PENDIENTE,
      });

      await service.procesarWebhookAlegra({ documentId: 'alegra-doc-1', legalStatus: 'ACCEPTED' });

      expect(documentosRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estado: EstadoDocumentoElectronico.ACEPTADO }),
      );
      expect(suscripcionesService.registrarConsumo).toHaveBeenCalledWith('neg-1', 'documentosDianPorMes');
    });

    it('no toca un documento que ya no está PENDIENTE (idempotente)', async () => {
      documentosRepo.findOne.mockResolvedValue({
        id: 'doc-1', negocioId: 'neg-1', estado: EstadoDocumentoElectronico.ACEPTADO,
      });

      await service.procesarWebhookAlegra({ documentId: 'alegra-doc-1', legalStatus: 'REJECTED' });

      expect(documentosRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('reconciliarPendientes', () => {
    it('reintenta un PENDIENTE sin tocar hace más de 5 minutos si el negocio está HABILITADO', async () => {
      const documentoViejo = {
        id: 'doc-1', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'DEE_POS' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 1,
        ultimoIntentoEn: new Date(Date.now() - 10 * 60 * 1000),
      };
      documentosRepo.find.mockResolvedValue([documentoViejo]);
      habilitacionRepo.findOne.mockResolvedValue({
        negocioId: 'neg-1', estado: EstadoHabilitacion.HABILITADO, alegraCompanyId: 'company-1',
        siguienteNumero: 1, ambiente: 'PRODUCCION',
      });
      alegraClient.crearDocumentoEquivalentePos.mockResolvedValue({ alegraDocumentId: 'doc-r', status: 'REGISTERED' });

      await service.reconciliarPendientes();

      expect(alegraClient.crearDocumentoEquivalentePos).toHaveBeenCalled();
    });

    it('no reintenta uno tocado hace menos de 5 minutos', async () => {
      documentosRepo.find.mockResolvedValue([
        {
          id: 'doc-1', negocioId: 'neg-1', tipo: 'DEE_POS' as const, estado: EstadoDocumentoElectronico.PENDIENTE,
          intentos: 1, ultimoIntentoEn: new Date(),
        },
      ]);

      await service.reconciliarPendientes();

      expect(alegraClient.crearDocumentoEquivalentePos).not.toHaveBeenCalled();
    });

    it('salta un documento cuyo negocio ya no está HABILITADO', async () => {
      documentosRepo.find.mockResolvedValue([
        {
          id: 'doc-1', negocioId: 'neg-1', tipo: 'DEE_POS' as const, estado: EstadoDocumentoElectronico.PENDIENTE,
          intentos: 1, ultimoIntentoEn: null,
        },
      ]);
      habilitacionRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', estado: EstadoHabilitacion.ERROR });

      await service.reconciliarPendientes();

      expect(alegraClient.crearDocumentoEquivalentePos).not.toHaveBeenCalled();
    });
  });

  describe('alertarDocumentosVencidos', () => {
    it('crea una alerta CRITICA para un documento vencido sin alerta previa', async () => {
      qbWhereMock.getMany.mockResolvedValue([{ id: 'doc-1', negocioId: 'neg-1', ventaId: 'venta-1' }]);
      alertasRepo.findOne.mockResolvedValue(null);

      await service.alertarDocumentosVencidos();

      expect(alertasRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: TipoAlerta.FACTURACION_DIAN_VENCIDA, negocioId: 'neg-1' }),
      );
      expect(realtimeGateway.emitToNegocio).toHaveBeenCalledWith('neg-1', 'alertas:cambio', expect.anything());
    });

    it('actualiza (no duplica) una alerta ya existente para el mismo documento', async () => {
      qbWhereMock.getMany.mockResolvedValue([{ id: 'doc-1', negocioId: 'neg-1', ventaId: 'venta-1' }]);
      alertasRepo.findOne.mockResolvedValue({ id: 'alerta-1', mensaje: 'vieja' });

      await service.alertarDocumentosVencidos();

      const guardada = alertasRepo.save.mock.calls[0][0];
      expect(guardada.id).toBe('alerta-1');
      expect(alertasRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('obtenerDocumentoPorVenta / reintentarPorVenta / obtenerLinksDescarga', () => {
    it('obtenerDocumentoPorVenta busca por ventaId', async () => {
      documentosRepo.findOne.mockResolvedValue({ id: 'doc-1', ventaId: 'venta-1' });
      const resultado = await service.obtenerDocumentoPorVenta('venta-1');
      expect(documentosRepo.findOne).toHaveBeenCalledWith({ where: { ventaId: 'venta-1' } });
      expect(resultado).toEqual({ id: 'doc-1', ventaId: 'venta-1' });
    });

    it('reintentarPorVenta llama a intentarEmitir con el documento y la habilitación del negocio', async () => {
      const documento = {
        id: 'doc-1', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'DEE_POS' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0,
      };
      documentosRepo.findOneOrFail.mockResolvedValue(documento);
      habilitacionRepo.findOneOrFail.mockResolvedValue({
        negocioId: 'neg-1', estado: EstadoHabilitacion.HABILITADO, alegraCompanyId: 'company-1',
        siguienteNumero: 1, ambiente: 'PRODUCCION',
      });
      alegraClient.crearDocumentoEquivalentePos.mockResolvedValue({ alegraDocumentId: 'doc-r', status: 'REGISTERED' });

      await service.reintentarPorVenta('venta-1');

      expect(alegraClient.crearDocumentoEquivalentePos).toHaveBeenCalled();
    });

    it('obtenerLinksDescarga devuelve vacío si el documento no tiene alegraDocumentId todavía', async () => {
      documentosRepo.findOneOrFail.mockResolvedValue({ id: 'doc-1', negocioId: 'neg-1' });
      const resultado = await service.obtenerLinksDescarga('venta-1');
      expect(resultado).toEqual({});
      expect(alegraClient.consultarDocumento).not.toHaveBeenCalled();
    });

    it('obtenerLinksDescarga consulta a Alegra si ya hay alegraDocumentId', async () => {
      documentosRepo.findOneOrFail.mockResolvedValue({ id: 'doc-1', negocioId: 'neg-1', alegraDocumentId: 'alegra-1' });
      habilitacionRepo.findOneOrFail.mockResolvedValue({ negocioId: 'neg-1', ambiente: 'PRODUCCION' });
      alegraClient.consultarDocumento.mockResolvedValue({ status: 'REGISTERED', urlXml: 'x.xml', urlPdf: 'x.pdf' });

      const resultado = await service.obtenerLinksDescarga('venta-1');

      expect(resultado).toEqual({ urlXml: 'x.xml', urlPdf: 'x.pdf' });
    });
  });
});
