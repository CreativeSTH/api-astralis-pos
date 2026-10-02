import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FacturacionElectronicaService } from './facturacion-electronica.service';
import { HabilitacionFacturacionElectronica } from './entities/habilitacion-facturacion-electronica.entity';
import { DocumentoElectronico } from './entities/documento-electronico.entity';
import { EstadoHabilitacion } from './entities/estado-habilitacion.enum';
import { EstadoDocumentoElectronico } from './entities/estado-documento-electronico.enum';
import { AlegraClientService } from './alegra-client.service';
import { FacturaPdfService } from './factura-pdf.service';
import { LogoNegocioService } from './logo-negocio.service';
import { Negocio } from '../negocios/entities/negocio.entity';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';
import { Alerta } from '../alertas/entities/alerta.entity';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TipoAlerta } from '../common/enums/alerta.enum';
import { Venta } from '../ventas/entities/venta.entity';
import { ContingenciaService } from './contingencia.service';
import { AlegraNoDisponibleError } from './alegra-client.service';
import { EmailService } from '../email/email.service';
import { randomBytes } from 'crypto';
import { unzipSync } from 'fflate';
import { In } from 'typeorm';
import { Devolucion } from '../devoluciones/entities/devolucion.entity';

type AlegraClientMock = {
  crearCompania: jest.Mock;
  crearTestSet: jest.Mock;
  consultarCompania: jest.Mock;
  crearDocumentoEquivalentePos: jest.Mock;
  crearFactura: jest.Mock;
  consultarFactura: jest.Mock;
  crearNotaCredito: jest.Mock;
  consultarNotaCredito: jest.Mock;
  crearNotaDebito: jest.Mock;
  crearNotaAjuste: jest.Mock;
  consultarDocumento: jest.Mock;
};

/** Venta de prueba mínima pero con todos los campos que `intentarEmitir` necesita para mapear el payload de Alegra. */
function ventaDePrueba(overrides: Partial<Venta> = {}): Venta {
  return {
    id: 'venta-1',
    tipoVenta: 'CONTADO',
    subtotal: 10000,
    descuentoTotal: 0,
    impuestoTotal: 0,
    total: 10000,
    cliente: undefined,
    items: [
      {
        productoId: 'prod-1',
        nombreProducto: 'Producto de prueba',
        cantidad: 1,
        precioUnitario: 10000,
        subtotal: 10000,
        baseImponible: 10000,
        impuesto: 0,
      },
    ],
    pagos: [{ metodoPago: 'Efectivo', monto: 10000 }],
    ...overrides,
  } as unknown as Venta;
}

const HABILITACION_CON_RESOLUCION = {
  negocioId: 'neg-1',
  estado: EstadoHabilitacion.HABILITADO,
  alegraCompanyId: 'company-1',
  siguienteNumero: 1,
  ambiente: 'PRODUCCION' as const,
  resolucionPrefijo: 'DE',
  resolucionNumero: '18760000001',
  resolucionFechaInicio: '2026-01-01',
  resolucionFechaFin: '2027-01-01',
  resolucionRangoDesde: 1,
  resolucionRangoHasta: 100000,
  resolucionTechnicalKey: 'abc123',
};

/** Query builder encadenable de TypeORM — cada método devuelve el mismo objeto, los terminales resuelven lo que el test necesita. */
function qbEncadenable(resultado: { items?: unknown[]; total?: number; conteos?: unknown[] } = {}) {
  const qb: Record<string, jest.Mock> = {};
  for (const metodo of ['where', 'andWhere', 'orderBy', 'offset', 'limit', 'select', 'addSelect', 'groupBy']) {
    qb[metodo] = jest.fn().mockReturnValue(qb);
  }
  qb.getManyAndCount = jest.fn().mockResolvedValue([resultado.items ?? [], resultado.total ?? 0]);
  qb.getRawMany = jest.fn().mockResolvedValue(resultado.conteos ?? []);
  return qb;
}

describe('FacturacionElectronicaService — wizard pasos 1-3', () => {
  let service: FacturacionElectronicaService;
  let habilitacionRepo: { findOne: jest.Mock; findOneOrFail: jest.Mock; create: jest.Mock; save: jest.Mock };
  let documentosRepo: {
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let emailService: { enviar: jest.Mock };
  let negociosRepo: { findOneOrFail: jest.Mock; save: jest.Mock };
  let ventasRepo: { findOneOrFail: jest.Mock; findOne: jest.Mock };
  let facturaPdf: { generar: jest.Mock; generarQrDataUrl: jest.Mock };
  let logoNegocio: { resolverLogo: jest.Mock };
  let alegraClient: AlegraClientMock;
  let suscripcionesService: { registrarConsumo: jest.Mock; miEstado: jest.Mock };
  let alertasRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let realtimeGateway: { emitToNegocio: jest.Mock };
  let devolucionesRepo: { findOne: jest.Mock; findOneOrFail: jest.Mock };
  let qbWhereMock: { where: jest.Mock; andWhere: jest.Mock; getMany: jest.Mock };
  let contingencia: {
    periodoActivo: jest.Mock;
    asignarNumero: jest.Mock;
    registrarIndisponibilidad: jest.Mock;
    registrarDisponibilidad: jest.Mock;
    estaAbierto: jest.Mock;
    periodosAutomaticosAbiertos: jest.Mock;
    finalizar: jest.Mock;
  };

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
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(qbWhereMock),
    };
    emailService = { enviar: jest.fn().mockResolvedValue({ ok: true }) };
    negociosRepo = {
      findOneOrFail: jest.fn().mockResolvedValue({ nit: '899999034', email: 'negocio@test.local' }),
      save: jest.fn(async (x: unknown) => x),
    };
    ventasRepo = {
      findOneOrFail: jest.fn().mockResolvedValue(ventaDePrueba()),
      findOne: jest.fn().mockResolvedValue(ventaDePrueba()),
    };
    facturaPdf = {
      generar: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.3')),
      generarQrDataUrl: jest.fn().mockResolvedValue('data:image/png;base64,QR'),
    };
    logoNegocio = { resolverLogo: jest.fn().mockResolvedValue(null) };
    alegraClient = {
      crearCompania: jest.fn(),
      crearTestSet: jest.fn(),
      consultarCompania: jest.fn().mockResolvedValue({ posAutorizado: true }),
      crearDocumentoEquivalentePos: jest.fn(),
      crearFactura: jest.fn().mockResolvedValue({ alegraDocumentId: 'inv-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true }),
      consultarFactura: jest.fn(),
      crearNotaCredito: jest.fn().mockResolvedValue({ alegraDocumentId: 'cn-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true }),
      crearNotaDebito: jest.fn().mockResolvedValue({ alegraDocumentId: 'dn-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true }),
      crearNotaAjuste: jest.fn(),
      consultarDocumento: jest.fn(),
      consultarNotaCredito: jest.fn(),
    };
    suscripcionesService = { registrarConsumo: jest.fn(), miEstado: jest.fn() };
    alertasRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
    realtimeGateway = { emitToNegocio: jest.fn() };
    devolucionesRepo = { findOne: jest.fn(), findOneOrFail: jest.fn() };
    contingencia = {
      periodoActivo: jest.fn().mockResolvedValue(null),
      asignarNumero: jest.fn(),
      registrarIndisponibilidad: jest.fn().mockResolvedValue(undefined),
      registrarDisponibilidad: jest.fn().mockResolvedValue(undefined),
      estaAbierto: jest.fn().mockResolvedValue(false),
      periodosAutomaticosAbiertos: jest.fn().mockResolvedValue([]),
      finalizar: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        FacturacionElectronicaService,
        { provide: getRepositoryToken(HabilitacionFacturacionElectronica), useValue: habilitacionRepo },
        { provide: getRepositoryToken(DocumentoElectronico), useValue: documentosRepo },
        { provide: getRepositoryToken(Negocio), useValue: negociosRepo },
        { provide: getRepositoryToken(Alerta), useValue: alertasRepo },
        { provide: getRepositoryToken(Venta), useValue: ventasRepo },
        { provide: getRepositoryToken(Devolucion), useValue: devolucionesRepo },
        { provide: AlegraClientService, useValue: alegraClient },
        { provide: SuscripcionesService, useValue: suscripcionesService },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: FacturaPdfService, useValue: facturaPdf },
        { provide: LogoNegocioService, useValue: logoNegocio },
        { provide: ContingenciaService, useValue: contingencia },
        { provide: EmailService, useValue: emailService },
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

  it('cargarResolucion calcula identification/dv del NIT real del negocio y avanza a RESOLUCION_CARGADA', async () => {
    habilitacionRepo.findOne.mockResolvedValue({
      negocioId: 'neg-1',
      estado: EstadoHabilitacion.ESPERANDO_TRAMITE_DIAN,
      razonSocial: 'Mascotas Pet Shop',
      direccion: 'Calle 1',
      ciudad: 'Bogotá, D.C.',
      ciudadCodigo: '11001',
      departamentoCodigo: '11',
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
      governmentTestSetId: 'a70562e0-631e-4ceb-aa65-36887b57dc17',
    });

    expect(negociosRepo.findOneOrFail).toHaveBeenCalledWith({ where: { id: 'neg-1' } });
    // NIT público de la DIAN (899999034) tiene dv=1 — algoritmo oficial, ver nit.spec.ts.
    expect(alegraClient.crearCompania).toHaveBeenCalledWith(
      expect.objectContaining({ identification: '899999034', dv: '1', identificationType: '31', organizationType: 1 }),
    );
    expect(resultado.estado).toBe(EstadoHabilitacion.RESOLUCION_CARGADA);
    expect(resultado.alegraCompanyId).toBe('company-1');
    expect(resultado.siguienteNumero).toBe(1);
    expect(resultado.governmentTestSetId).toBe('a70562e0-631e-4ceb-aa65-36887b57dc17');
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
        governmentTestSetId: 'test-set-id',
      }),
    ).rejects.toThrow();
  });

  describe('confirmarTestSet', () => {
    it('emite 8 facturas + 1 nota crédito + 1 nota débito de prueba (tamaño real exigido por la DIAN para Factura) y pasa a HABILITADO', async () => {
      habilitacionRepo.findOne.mockResolvedValue({
        ...HABILITACION_CON_RESOLUCION,
        estado: EstadoHabilitacion.RESOLUCION_CARGADA,
        ambiente: 'SANDBOX',
        governmentTestSetId: 'a70562e0-631e-4ceb-aa65-36887b57dc17',
      });
      alegraClient.crearTestSet.mockResolvedValue({ testSetId: 'testset-1' });
      alegraClient.crearFactura.mockResolvedValue({ alegraDocumentId: 'inv-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true, cufe: 'cufe-1', fecha: '2026-01-05' });

      const resultado = await service.confirmarTestSet('neg-1');

      expect(alegraClient.crearTestSet).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'invoices', governmentId: 'a70562e0-631e-4ceb-aa65-36887b57dc17' }),
      );
      expect(alegraClient.crearFactura).toHaveBeenCalledTimes(8);
      expect(alegraClient.crearNotaCredito).toHaveBeenCalledTimes(1);
      expect(alegraClient.crearNotaDebito).toHaveBeenCalledTimes(1);
      expect(resultado.estado).toBe(EstadoHabilitacion.HABILITADO);
      expect(resultado.ambiente).toBe('PRODUCCION');
    });

    it('sondea consultarCompania con tipo invoices hasta que la DIAN autoriza antes de emitir (confirmado en vivo: no es instantáneo)', async () => {
      jest.useFakeTimers();
      habilitacionRepo.findOne.mockResolvedValue({
        ...HABILITACION_CON_RESOLUCION,
        estado: EstadoHabilitacion.RESOLUCION_CARGADA,
        governmentTestSetId: 'a70562e0-631e-4ceb-aa65-36887b57dc17',
      });
      alegraClient.crearTestSet.mockResolvedValue({ testSetId: 'testset-1' });
      alegraClient.consultarCompania
        .mockResolvedValueOnce({ posAutorizado: false })
        .mockResolvedValueOnce({ posAutorizado: false })
        .mockResolvedValueOnce({ posAutorizado: true });

      const promesa = service.confirmarTestSet('neg-1');
      await jest.runAllTimersAsync();
      const resultado = await promesa;

      expect(alegraClient.consultarCompania).toHaveBeenCalledTimes(3);
      expect(alegraClient.consultarCompania).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'invoices' }));
      expect(resultado.estado).toBe(EstadoHabilitacion.HABILITADO);
      jest.useRealTimers();
    });

    it('deja el estado en ERROR si la DIAN nunca autoriza dentro del límite de reintentos', async () => {
      jest.useFakeTimers();
      habilitacionRepo.findOne.mockResolvedValue({
        ...HABILITACION_CON_RESOLUCION,
        estado: EstadoHabilitacion.RESOLUCION_CARGADA,
        governmentTestSetId: 'a70562e0-631e-4ceb-aa65-36887b57dc17',
      });
      alegraClient.crearTestSet.mockResolvedValue({ testSetId: 'testset-1' });
      alegraClient.consultarCompania.mockResolvedValue({ posAutorizado: false });

      const promesa = service.confirmarTestSet('neg-1');
      await jest.runAllTimersAsync();
      const resultado = await promesa;

      expect(resultado.estado).toBe(EstadoHabilitacion.ERROR);
      expect(alegraClient.crearFactura).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('trata "already been approved" como éxito (idempotencia tras reintento por timeout)', async () => {
      habilitacionRepo.findOne.mockResolvedValue({
        ...HABILITACION_CON_RESOLUCION,
        estado: EstadoHabilitacion.RESOLUCION_CARGADA,
        governmentTestSetId: 'a70562e0-631e-4ceb-aa65-36887b57dc17',
      });
      alegraClient.crearTestSet.mockRejectedValue(
        new Error('Test set in this company has already been approved. No additional submissions are required.'),
      );

      const resultado = await service.confirmarTestSet('neg-1');

      expect(resultado.estado).toBe(EstadoHabilitacion.HABILITADO);
    });

    it('rechaza si falta el governmentTestSetId de la DIAN', async () => {
      habilitacionRepo.findOne.mockResolvedValue({
        ...HABILITACION_CON_RESOLUCION,
        estado: EstadoHabilitacion.RESOLUCION_CARGADA,
        governmentTestSetId: undefined,
      });

      await expect(service.confirmarTestSet('neg-1')).rejects.toThrow();
      expect(alegraClient.crearTestSet).not.toHaveBeenCalled();
    });

    it('deja el estado en ERROR con el mensaje si Alegra rechaza el testset', async () => {
      habilitacionRepo.findOne.mockResolvedValue({
        ...HABILITACION_CON_RESOLUCION,
        estado: EstadoHabilitacion.RESOLUCION_CARGADA,
        governmentTestSetId: 'a70562e0-631e-4ceb-aa65-36887b57dc17',
      });
      alegraClient.crearTestSet.mockRejectedValue(new Error('testset rechazado'));

      const resultado = await service.confirmarTestSet('neg-1');

      expect(resultado.estado).toBe(EstadoHabilitacion.ERROR);
      expect(resultado.errorMensaje).toBe('testset rechazado');
    });

    it('con esHabilitacionDePrueba, NO pasa ambiente a PRODUCCION al terminar (se queda en SANDBOX)', async () => {
      habilitacionRepo.findOne.mockResolvedValue({
        ...HABILITACION_CON_RESOLUCION,
        estado: EstadoHabilitacion.RESOLUCION_CARGADA,
        ambiente: 'SANDBOX',
        esHabilitacionDePrueba: true,
        governmentTestSetId: 'a70562e0-631e-4ceb-aa65-36887b57dc17',
      });
      alegraClient.crearTestSet.mockResolvedValue({ testSetId: 'testset-1' });
      alegraClient.crearFactura.mockResolvedValue({ alegraDocumentId: 'inv-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true, cufe: 'cufe-1', fecha: '2026-01-05' });

      const resultado = await service.confirmarTestSet('neg-1');

      expect(resultado.estado).toBe(EstadoHabilitacion.HABILITADO);
      expect(resultado.ambiente).toBe('SANDBOX');
    });
  });

  describe('activarModoSandboxDePrueba', () => {
    it('rechaza si el negocio no está en PRUEBA', async () => {
      suscripcionesService.miEstado = jest.fn().mockResolvedValue({ estado: 'ACTIVA' });

      await expect(
        service.activarModoSandboxDePrueba('neg-1', {
          razonSocial: 'Negocio Test',
          nit: '900123456',
          email: 'negocio@test.local',
          direccion: 'Cra 1 # 2-3',
          ciudadNombre: 'Bogotá',
          ciudadCodigo: '11001',
          departamentoCodigo: '11',
          useAlegraCertificate: true,
        }),
      ).rejects.toThrow('El modo sandbox de prueba solo está disponible durante el trial gratis');
    });

    it('con PRUEBA, corre el pipeline completo y queda HABILITADO en SANDBOX', async () => {
      suscripcionesService.miEstado = jest.fn().mockResolvedValue({ estado: 'PRUEBA' });
      negociosRepo.save = jest.fn(async (x: unknown) => x);
      habilitacionRepo.findOne
        .mockResolvedValueOnce(null) // obtenerOCrearHabilitacion dentro de actualizarDatosNegocio
        .mockResolvedValueOnce({ negocioId: 'neg-1', estado: EstadoHabilitacion.ESPERANDO_TRAMITE_DIAN, razonSocial: 'Negocio Test', useAlegraCertificate: true }) // obtenerOCrearHabilitacion dentro de cargarResolucion
        .mockResolvedValueOnce({
          ...HABILITACION_CON_RESOLUCION,
          negocioId: 'neg-1',
          estado: EstadoHabilitacion.RESOLUCION_CARGADA,
          esHabilitacionDePrueba: true,
          ambiente: 'SANDBOX',
          alegraCompanyId: 'company-sandbox-1',
          siguienteNumero: 1,
          governmentTestSetId: 'a70562e0-631e-4ceb-aa65-36887b57dc17',
        }); // obtenerOCrearHabilitacion dentro de confirmarTestSet
      alegraClient.crearCompania.mockResolvedValue({ companyId: 'company-sandbox-1' });
      alegraClient.crearTestSet.mockResolvedValue({ testSetId: 'testset-1' });
      alegraClient.crearFactura.mockResolvedValue({ alegraDocumentId: 'inv-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true, cufe: 'cufe-1', fecha: '2026-01-05' });

      const resultado = await service.activarModoSandboxDePrueba('neg-1', {
        razonSocial: 'Negocio Test',
        nit: '900123456',
        email: 'negocio@test.local',
        direccion: 'Cra 1 # 2-3',
        ciudadNombre: 'Bogotá',
        ciudadCodigo: '11001',
        departamentoCodigo: '11',
        useAlegraCertificate: true,
      });

      expect(resultado.estado).toBe(EstadoHabilitacion.HABILITADO);
      expect(resultado.ambiente).toBe('SANDBOX');
    });
  });

  describe('volverAModoReal', () => {
    it('rechaza si la habilitación no está en modo sandbox HABILITADO', async () => {
      habilitacionRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', estado: EstadoHabilitacion.ESPERANDO_TRAMITE_DIAN, esHabilitacionDePrueba: false });

      await expect(service.volverAModoReal('neg-1')).rejects.toThrow('Esta habilitación no está en modo sandbox de prueba');
    });

    it('con una habilitación en modo sandbox, resetea a ESPERANDO_TRAMITE_DIAN y limpia los campos de resolución sin tocar razonSocial/direccion', async () => {
      habilitacionRepo.findOne.mockResolvedValue({
        negocioId: 'neg-1',
        estado: EstadoHabilitacion.HABILITADO,
        esHabilitacionDePrueba: true,
        ambiente: 'SANDBOX',
        razonSocial: 'Negocio Test',
        direccion: 'Cra 1 # 2-3',
        resolucionNumero: '00000000000000',
        resolucionPrefijo: 'PRUEBA',
        alegraCompanyId: 'company-sandbox-1',
      });

      const resultado = await service.volverAModoReal('neg-1');

      expect(resultado.estado).toBe(EstadoHabilitacion.ESPERANDO_TRAMITE_DIAN);
      expect(resultado.esHabilitacionDePrueba).toBe(false);
      expect(resultado.resolucionNumero).toBeUndefined();
      expect(resultado.alegraCompanyId).toBeUndefined();
      expect(resultado.razonSocial).toBe('Negocio Test');
      expect(resultado.direccion).toBe('Cra 1 # 2-3');
    });
  });

  describe('emitirDocumento — fail-closed', () => {
    it('no crea DocumentoElectronico si el negocio no está HABILITADO', async () => {
      habilitacionRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', estado: EstadoHabilitacion.RESOLUCION_CARGADA });

      await service.emitirDocumento({ id: 'venta-1', negocioId: 'neg-1', tipoComprobanteEmitido: 'RECIBO' } as any);

      expect(documentosRepo.save).not.toHaveBeenCalled();
    });

    it('crea el documento en PENDIENTE con tipo FACTURA y llama a intentarEmitir si la venta es FACTURA_ELECTRONICA y el negocio está HABILITADO', async () => {
      habilitacionRepo.findOne.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });
      alegraClient.crearFactura.mockResolvedValue({
        alegraDocumentId: 'doc-9',
        cufe: 'cufe-9',
        status: 'SENT',
        legalStatus: 'ACCEPTED',
        isFinal: true,
      });

      await service.emitirDocumento({ id: 'venta-1', negocioId: 'neg-1', tipoComprobanteEmitido: 'FACTURA_ELECTRONICA' } as any);

      expect(documentosRepo.save).toHaveBeenCalled();
      const documentoCreado = documentosRepo.save.mock.calls[0][0];
      expect(documentoCreado.tipo).toBe('FACTURA');
      const documentoGuardado = documentosRepo.save.mock.calls.at(-1)![0];
      expect(documentoGuardado.estado).toBe(EstadoDocumentoElectronico.ACEPTADO);
      expect(documentoGuardado.cufe).toBe('cufe-9');
      expect(suscripcionesService.registrarConsumo).toHaveBeenCalledWith('neg-1', 'documentosDianPorMes');
    });

    it('con ambiente SANDBOX, NO registra consumo aunque el documento quede ACEPTADO', async () => {
      habilitacionRepo.findOne.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION, ambiente: 'SANDBOX', esHabilitacionDePrueba: true });
      alegraClient.crearFactura.mockResolvedValue({
        alegraDocumentId: 'doc-sandbox-1',
        cufe: 'cufe-sandbox-1',
        status: 'SENT',
        legalStatus: 'ACCEPTED',
        isFinal: true,
      });

      await service.emitirDocumento({ id: 'venta-1', negocioId: 'neg-1', tipoComprobanteEmitido: 'FACTURA_ELECTRONICA' } as any);

      expect(suscripcionesService.registrarConsumo).not.toHaveBeenCalled();
    });

    it('no emite nada si la venta no es FACTURA_ELECTRONICA, aunque el negocio esté HABILITADO (nunca dos documentos por venta)', async () => {
      habilitacionRepo.findOne.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });

      await service.emitirDocumento({ id: 'venta-1', negocioId: 'neg-1', tipoComprobanteEmitido: 'RECIBO' } as any);

      expect(habilitacionRepo.findOne).not.toHaveBeenCalled();
      expect(documentosRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('intentarEmitir — numeración correlativa real y mapeo de la venta', () => {
    it('cliente con NIT: manda el número sin DV, el dv calculado y organizationType 1', async () => {
      const documento: any = { id: 'doc-n', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA', estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0 };
      ventasRepo.findOneOrFail.mockResolvedValue(
        ventaDePrueba({ cliente: { nombre: 'Ferretería SAS', documentoIdentidad: '899.999.034-1', tipoDocumentoIdentidad: '31' } } as any),
      );

      await service.intentarEmitir(documento, { ...HABILITACION_CON_RESOLUCION } as any);

      expect(alegraClient.crearFactura).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: { identificationNumber: '899999034', identificationType: '31', dv: '1', organizationType: 1, name: 'Ferretería SAS' },
        }),
      );
    });

    it('cliente con cédula: sin dv ni organizationType', async () => {
      const documento: any = { id: 'doc-c', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA', estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0 };
      ventasRepo.findOneOrFail.mockResolvedValue(
        ventaDePrueba({ cliente: { nombre: 'Ana Gómez', documentoIdentidad: ' 1020304050 ', tipoDocumentoIdentidad: '13' } } as any),
      );

      await service.intentarEmitir(documento, { ...HABILITACION_CON_RESOLUCION } as any);

      expect(alegraClient.crearFactura).toHaveBeenCalledWith(
        expect.objectContaining({ customer: { identificationNumber: '1020304050', identificationType: '13', name: 'Ana Gómez' } }),
      );
    });

    it('manda el correo del cliente a Alegra (campo DIAN ElectronicMail)', async () => {
      const documento: any = { id: 'doc-e', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA', estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0 };
      ventasRepo.findOneOrFail.mockResolvedValue(
        ventaDePrueba({ cliente: { nombre: 'Ana', documentoIdentidad: '1047', tipoDocumentoIdentidad: '13', email: ' ana@correo.co ' } } as any),
      );

      await service.intentarEmitir(documento, { ...HABILITACION_CON_RESOLUCION } as any);

      expect(alegraClient.crearFactura).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: { identificationNumber: '1047', identificationType: '13', name: 'Ana', email: 'ana@correo.co' },
        }),
      );
    });

    it('usa habilitacion.siguienteNumero (no documento.intentos), lo manda como number, y lo avanza tras un envío exitoso', async () => {
      const documento = {
        id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 7, // deliberadamente distinto de siguienteNumero
      };
      const habilitacion = { ...HABILITACION_CON_RESOLUCION, siguienteNumero: 42 };
      alegraClient.crearFactura.mockResolvedValue({
        alegraDocumentId: 'doc-42', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true,
      });

      await service.intentarEmitir(documento as any, habilitacion as any);

      expect(alegraClient.crearFactura).toHaveBeenCalledWith(
        expect.objectContaining({ number: 42 }),
      );
      expect(habilitacion.siguienteNumero).toBe(43);
      expect(habilitacionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ siguienteNumero: 43 }));
    });

    it('venta a crédito sin pagos: un solo pago forma 2, medio 1 y vencimiento en la última cuota', async () => {
      const documento: any = { id: 'doc-cr', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA', estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0 };
      ventasRepo.findOneOrFail.mockResolvedValue(
        ventaDePrueba({
          tipoVenta: 'CREDITO',
          pagos: [],
          cuotas: [
            { numero: 2, fechaVencimiento: '2026-11-29' },
            { numero: 3, fechaVencimiento: '2026-12-29' },
            { numero: 1, fechaVencimiento: '2026-10-29' },
          ],
        } as any),
      );

      await service.intentarEmitir(documento, { ...HABILITACION_CON_RESOLUCION } as any);

      const [llamado] = alegraClient.crearFactura.mock.calls[0];
      expect(llamado.payments).toEqual([{ paymentForm: '2', paymentMethod: '1', paymentDueDate: '2026-12-29' }]);
      expect(ventasRepo.findOneOrFail).toHaveBeenCalledWith(
        expect.objectContaining({ relations: expect.objectContaining({ cuotas: true }) }),
      );
    });

    it('venta a crédito sin cuotas cargadas (dato inconsistente): vence hoy en Colombia, nunca payments vacío', async () => {
      const documento: any = { id: 'doc-cr2', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA', estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0 };
      ventasRepo.findOneOrFail.mockResolvedValue(ventaDePrueba({ tipoVenta: 'CREDITO', pagos: [], cuotas: [] } as any));

      await service.intentarEmitir(documento, { ...HABILITACION_CON_RESOLUCION } as any);

      const [llamado] = alegraClient.crearFactura.mock.calls[0];
      expect(llamado.payments).toHaveLength(1);
      expect(llamado.payments[0]).toMatchObject({ paymentForm: '2', paymentMethod: '1' });
      expect(llamado.payments[0].paymentDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('de noche en Colombia manda a Alegra la fecha de HOY en Colombia, no la del día UTC siguiente', async () => {
      // Solo se falsea el reloj — los setTimeout reales siguen funcionando para el resto del flujo.
      jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'nextTick', 'queueMicrotask'] });
      jest.setSystemTime(new Date('2026-10-01T03:00:00Z')); // 30/09 22:00 en Bogotá
      try {
        const documento = {
          id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
          estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0,
        };
        alegraClient.crearFactura.mockResolvedValue({ alegraDocumentId: 'doc-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true });

        await service.intentarEmitir(documento as any, { ...HABILITACION_CON_RESOLUCION } as any);

        const [llamado] = alegraClient.crearFactura.mock.calls[0];
        expect(llamado.invoicePeriod).toEqual({ startDate: '2026-09-30', endDate: '2026-09-30' });
        expect(llamado.payments.every((p: { paymentDueDate: string }) => p.paymentDueDate === '2026-09-30')).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('mapea items directo desde baseImponible/impuesto persistidos (sin necesitar item.producto), y arma customer genérico sin cliente', async () => {
      const documento = {
        id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0,
      };
      ventasRepo.findOneOrFail.mockResolvedValue(
        ventaDePrueba({
          subtotal: 20000,
          descuentoTotal: 2000,
          impuestoTotal: 3420,
          total: 21420,
          clienteId: undefined,
          cliente: undefined,
          items: [
            {
              productoId: 'prod-a',
              nombreProducto: 'Producto A',
              cantidad: 2,
              precioUnitario: 10000,
              subtotal: 23800,
              baseImponible: 20000,
              impuesto: 3800,
            } as any,
          ],
          pagos: [{ metodoPago: 'Tarjeta', monto: 21420 } as any],
        }),
      );
      alegraClient.crearFactura.mockResolvedValue({
        alegraDocumentId: 'doc-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true,
      });

      await service.intentarEmitir(documento as any, { ...HABILITACION_CON_RESOLUCION } as any);

      const [llamado] = alegraClient.crearFactura.mock.calls[0];
      expect(llamado.items).toEqual([
        {
          description: 'Producto A',
          quantity: 2,
          price: 10000,
          unitCode: '94',
          code: '999',
          subtotal: 20000,
          total: 23800,
          taxAmount: 3800,
          taxes: [{ taxCode: '01', taxAmount: 3800, taxPercentage: '19.00', taxableAmount: 20000 }],
        },
      ]);
      expect(llamado.totalAmounts).toEqual({
        grossTotal: 20000, taxableTotal: 18000, taxTotal: 3420, payableTotal: 21420,
        discountTotal: 2000, chargeTotal: 0, advanceTotal: 0,
      });
      expect(llamado.payments).toEqual([
        expect.objectContaining({ paymentMethod: '49', paymentForm: '1' }),
      ]);
      expect(llamado.customer).toEqual({ identificationNumber: '222222222222', identificationType: '13', name: 'Consumidor Final' });
      expect(llamado.resolution).toEqual({
        prefix: 'DE', resolutionNumber: '18760000001', startDate: '2026-01-01',
        endDate: '2027-01-01', minNumber: 1, maxNumber: 100000, technicalKey: 'abc123',
      });
    });

    it('arma customer desde el Cliente real cuando la venta tiene clienteId con documento cargado', async () => {
      const documento = {
        id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0,
      };
      ventasRepo.findOneOrFail.mockResolvedValue(
        ventaDePrueba({
          clienteId: 'cliente-1',
          cliente: { nombre: 'Juan Pérez', documentoIdentidad: '123456789', tipoDocumentoIdentidad: '13' } as any,
        }),
      );
      alegraClient.crearFactura.mockResolvedValue({ alegraDocumentId: 'inv-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true });

      await service.intentarEmitir(documento as any, { ...HABILITACION_CON_RESOLUCION } as any);

      const [llamado] = alegraClient.crearFactura.mock.calls[0];
      expect(llamado.customer).toEqual({ identificationNumber: '123456789', identificationType: '13', name: 'Juan Pérez' });
    });

    it('guarda el motivo real de la DIAN y el detalle completo de reglas cuando legalStatus es REJECTED', async () => {
      const documento = {
        id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0,
      };
      alegraClient.crearFactura.mockResolvedValue({
        alegraDocumentId: 'doc-1', status: 'SENT', legalStatus: 'REJECTED', isFinal: true,
        governmentResponseMessage: 'Validación contiene errores en campos mandatorios.',
        errorMessages: ['Regla: DEAB10b, Rechazo: El prefijo no corresponde', 'Regla: DEAB12b, Rechazo: Rango no vigente'],
      });

      await service.intentarEmitir(documento as any, { ...HABILITACION_CON_RESOLUCION } as any);

      expect(documento.estado).toBe(EstadoDocumentoElectronico.RECHAZADO);
      expect((documento as any).errorMensaje).toBe('Validación contiene errores en campos mandatorios.');
      expect((documento as any).erroresDetalle).toEqual([
        'Regla: DEAB10b, Rechazo: El prefijo no corresponde',
        'Regla: DEAB12b, Rechazo: Rango no vigente',
      ]);
    });

    it('cuando la DIAN no responde al instante (isFinal false), deja el documento PENDIENTE con el trackingReference guardado', async () => {
      const documento = {
        id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0,
      };
      alegraClient.crearFactura.mockResolvedValue({
        alegraDocumentId: 'inv-2', status: 'SENT', isFinal: false,
        trackingReference: { flow: 'co.invoice', environment: 'sandbox', documentId: 'inv-2' },
      });

      await service.intentarEmitir(documento as any, { ...HABILITACION_CON_RESOLUCION } as any);

      expect(documento.estado).toBe(EstadoDocumentoElectronico.PENDIENTE);
      expect((documento as any).trackingReference).toEqual({ flow: 'co.invoice', environment: 'sandbox', documentId: 'inv-2' });
    });

    it('limpia un errorMensaje de un intento anterior si el reintento llega bien a Alegra', async () => {
      const documento = {
        id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 3,
        errorMensaje: 'Forbidden', // stale, de un intento anterior contra la URL/token equivocados
      };
      alegraClient.crearFactura.mockResolvedValue({
        alegraDocumentId: 'doc-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true,
      });

      await service.intentarEmitir(documento as any, { ...HABILITACION_CON_RESOLUCION } as any);

      expect((documento as any).errorMensaje).toBeUndefined();
    });

    it('no avanza siguienteNumero si la llamada a Alegra falla (no se consumió el número)', async () => {
      const documento = {
        id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0,
      };
      const habilitacion = { ...HABILITACION_CON_RESOLUCION, siguienteNumero: 10 };
      alegraClient.crearFactura.mockRejectedValue(new Error('timeout'));

      await service.intentarEmitir(documento as any, habilitacion as any);

      expect(habilitacion.siguienteNumero).toBe(10);
      expect(habilitacionRepo.save).not.toHaveBeenCalled();
    });

    it('emite documentos-electronicos:cambio por realtime en cada intento', async () => {
      const documento = {
        id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0,
      };
      alegraClient.crearFactura.mockResolvedValue({ alegraDocumentId: 'doc-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true });

      await service.intentarEmitir(documento as any, { ...HABILITACION_CON_RESOLUCION } as any);

      expect(realtimeGateway.emitToNegocio).toHaveBeenCalledWith('neg-1', 'documentos-electronicos:cambio', expect.objectContaining({ id: 'doc-x' }));
    });

    it('congela resolución, emisor, cliente y total, y guarda lo que Alegra devuelve para el PDF', async () => {
      const documento: any = {
        id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA',
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0,
      };
      ventasRepo.findOneOrFail.mockResolvedValue(ventaDePrueba({ nombreCliente: 'Juan Pérez', total: 11900 } as any));
      negociosRepo.findOneOrFail.mockResolvedValue({ nombre: 'Mascotas', nit: '899999034', direccion: 'Calle 9', ciudadNombre: 'Cali' });
      alegraClient.crearFactura.mockResolvedValue({
        alegraDocumentId: 'inv-7', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true,
        cufe: 'cufe-7', fullNumber: 'DE7', prefix: 'DE', number: 7, fecha: '2026-09-28T10:00:00-05:00', qrCodeContent: 'QR-7',
      });

      await service.intentarEmitir(documento, {
        ...HABILITACION_CON_RESOLUCION, siguienteNumero: 7, razonSocial: 'Mascotas SAS', direccion: 'Calle 1', ciudad: 'Bogotá, D.C.',
      } as any);

      expect(documento).toEqual(expect.objectContaining({
        numero: 7, prefijo: 'DE', numeroCompleto: 'DE7', qrContenido: 'QR-7', cufe: 'cufe-7', ambiente: 'PRODUCCION',
        resolucionNumero: '18760000001', resolucionFechaInicio: '2026-01-01', resolucionFechaFin: '2027-01-01',
        resolucionRangoDesde: 1, resolucionRangoHasta: 100000,
        emisorRazonSocial: 'Mascotas SAS', emisorNit: '899999034', emisorDireccion: 'Calle 1', emisorCiudad: 'Bogotá, D.C.',
        nombreCliente: 'Juan Pérez', total: 11900,
      }));
      expect(documento.fechaEmision).toEqual(new Date('2026-09-28T10:00:00-05:00'));
    });

    it('arma numeroCompleto con prefijo+número si Alegra no devuelve fullNumber', async () => {
      const documento: any = { id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA', estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0 };
      alegraClient.crearFactura.mockResolvedValue({ alegraDocumentId: 'inv-8', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true });

      await service.intentarEmitir(documento, { ...HABILITACION_CON_RESOLUCION, siguienteNumero: 8 } as any);

      expect(documento.numeroCompleto).toBe('DE8');
    });

    it('no congela nada si la llamada a Alegra falla', async () => {
      const documento: any = { id: 'doc-x', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA', estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0 };
      alegraClient.crearFactura.mockRejectedValue(new Error('timeout'));

      await service.intentarEmitir(documento, { ...HABILITACION_CON_RESOLUCION } as any);

      expect(documento.numeroCompleto).toBeUndefined();
      expect(documento.numero).toBeUndefined();
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
      habilitacionRepo.findOne.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });

      await service.procesarWebhookAlegra({ documentId: 'alegra-doc-1', legalStatus: 'ACCEPTED' });

      expect(documentosRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estado: EstadoDocumentoElectronico.ACEPTADO }),
      );
      expect(suscripcionesService.registrarConsumo).toHaveBeenCalledWith('neg-1', 'documentosDianPorMes');
    });

    it('con ambiente SANDBOX, marca ACEPTADO pero NO registra consumo', async () => {
      documentosRepo.findOne.mockResolvedValue({
        id: 'doc-1', negocioId: 'neg-1', estado: EstadoDocumentoElectronico.PENDIENTE,
      });
      habilitacionRepo.findOne.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION, ambiente: 'SANDBOX', esHabilitacionDePrueba: true });

      await service.procesarWebhookAlegra({ documentId: 'alegra-doc-1', legalStatus: 'ACCEPTED' });

      expect(documentosRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estado: EstadoDocumentoElectronico.ACEPTADO }),
      );
      expect(suscripcionesService.registrarConsumo).not.toHaveBeenCalled();
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
    it('reintenta el envío completo si el PENDIENTE no tiene trackingReference (falló antes de recibir respuesta)', async () => {
      const documentoViejo = {
        id: 'doc-1', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 1, trackingReference: null,
        ultimoIntentoEn: new Date(Date.now() - 10 * 60 * 1000),
      };
      documentosRepo.find.mockResolvedValue([documentoViejo]);
      habilitacionRepo.findOne.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });
      alegraClient.crearFactura.mockResolvedValue({ alegraDocumentId: 'doc-r', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true });

      await service.reconciliarPendientes();

      expect(alegraClient.crearFactura).toHaveBeenCalled();
      expect(alegraClient.consultarFactura).not.toHaveBeenCalled();
    });

    it('si el PENDIENTE tiene trackingReference, consulta en vez de reenviar', async () => {
      documentosRepo.find.mockResolvedValue([
        {
          id: 'doc-1', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
          estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 1, ultimoIntentoEn: null,
          trackingReference: { flow: 'co.invoice', environment: 'sandbox', documentId: 'inv-2' },
        },
      ]);
      habilitacionRepo.findOne.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });
      alegraClient.consultarFactura.mockResolvedValue({ alegraDocumentId: 'inv-2', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true, cufe: 'cufe-2' });

      await service.reconciliarPendientes();

      expect(alegraClient.consultarFactura).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'inv-2' }));
      expect(alegraClient.crearFactura).not.toHaveBeenCalled();
      expect(documentosRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estado: EstadoDocumentoElectronico.ACEPTADO, cufe: 'cufe-2' }),
      );
    });

    it('al resolverse un pendiente guarda número completo, fecha y QR que devuelve Alegra', async () => {
      documentosRepo.find.mockResolvedValue([
        {
          id: 'doc-1', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
          estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 1, ultimoIntentoEn: null,
          trackingReference: { flow: 'co.invoice', environment: 'sandbox', documentId: 'inv-2' },
        },
      ]);
      habilitacionRepo.findOne.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });
      alegraClient.consultarFactura.mockResolvedValue({
        alegraDocumentId: 'inv-2', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true,
        cufe: 'cufe-2', fullNumber: 'DE2', prefix: 'DE', number: 2, fecha: '2026-09-28T11:00:00-05:00', qrCodeContent: 'QR-2',
      });

      await service.reconciliarPendientes();

      expect(documentosRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        numeroCompleto: 'DE2', qrContenido: 'QR-2', fechaEmision: new Date('2026-09-28T11:00:00-05:00'),
      }));
    });

    it('si la consulta todavía no es final, deja el documento PENDIENTE sin tocar el estado', async () => {
      documentosRepo.find.mockResolvedValue([
        {
          id: 'doc-1', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
          estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 1, ultimoIntentoEn: null,
          trackingReference: { flow: 'co.invoice', environment: 'sandbox', documentId: 'inv-2' },
        },
      ]);
      habilitacionRepo.findOne.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });
      alegraClient.consultarFactura.mockResolvedValue({ alegraDocumentId: 'inv-2', status: 'SENT', isFinal: false });

      await service.reconciliarPendientes();

      const guardado = documentosRepo.save.mock.calls.at(-1)![0];
      expect(guardado.estado).toBe(EstadoDocumentoElectronico.PENDIENTE);
    });

    it('no reintenta uno tocado hace menos de 5 minutos', async () => {
      documentosRepo.find.mockResolvedValue([
        {
          id: 'doc-1', negocioId: 'neg-1', tipo: 'FACTURA' as const, estado: EstadoDocumentoElectronico.PENDIENTE,
          intentos: 1, ultimoIntentoEn: new Date(),
        },
      ]);

      await service.reconciliarPendientes();

      expect(alegraClient.crearFactura).not.toHaveBeenCalled();
      expect(alegraClient.consultarFactura).not.toHaveBeenCalled();
    });

    it('salta un documento cuyo negocio ya no está HABILITADO', async () => {
      documentosRepo.find.mockResolvedValue([
        {
          id: 'doc-1', negocioId: 'neg-1', tipo: 'FACTURA' as const, estado: EstadoDocumentoElectronico.PENDIENTE,
          intentos: 1, ultimoIntentoEn: null,
        },
      ]);
      habilitacionRepo.findOne.mockResolvedValue({ negocioId: 'neg-1', estado: EstadoHabilitacion.ERROR });

      await service.reconciliarPendientes();

      expect(alegraClient.crearFactura).not.toHaveBeenCalled();
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

  describe('documentos por venta', () => {
    it('obtenerDocumentoPorVenta busca por ventaId Y negocioId (nunca solo por ventaId), y solo la factura (no notas crédito)', async () => {
      documentosRepo.findOne.mockResolvedValue({ id: 'doc-1', ventaId: 'venta-1' });
      const resultado = await service.obtenerDocumentoPorVenta('venta-1', 'neg-1');
      expect(documentosRepo.findOne).toHaveBeenCalledWith({
        where: { ventaId: 'venta-1', negocioId: 'neg-1', tipo: In(['FACTURA', 'DEE_POS']) },
      });
      expect(resultado).toEqual({ id: 'doc-1', ventaId: 'venta-1' });
    });

    it('obtenerDocumentoPorVenta devuelve null si el documento es de otro negocio', async () => {
      documentosRepo.findOne.mockResolvedValue(null);
      const resultado = await service.obtenerDocumentoPorVenta('venta-de-otro', 'neg-1');
      expect(resultado).toBeNull();
    });

    it('reintentarPorVenta llama a intentarEmitir con el documento y la habilitación del negocio', async () => {
      const documento = {
        id: 'doc-1', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const,
        estado: EstadoDocumentoElectronico.PENDIENTE, intentos: 0,
      };
      documentosRepo.findOne.mockResolvedValue(documento);
      habilitacionRepo.findOneOrFail.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });
      alegraClient.crearFactura.mockResolvedValue({ alegraDocumentId: 'doc-r', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true });

      await service.reintentarPorVenta('venta-1', 'neg-1');

      expect(documentosRepo.findOne).toHaveBeenCalledWith({
      where: { ventaId: 'venta-1', negocioId: 'neg-1', tipo: In(['FACTURA', 'DEE_POS']) },
    });
      expect(alegraClient.crearFactura).toHaveBeenCalled();
    });

    it('reintentarPorVenta lanza NotFoundException (404) si el documento es de otro negocio, sin tocar Alegra', async () => {
      documentosRepo.findOne.mockResolvedValue(null);
      await expect(service.reintentarPorVenta('venta-de-otro', 'neg-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(alegraClient.crearFactura).not.toHaveBeenCalled();
    });

    it('reintentarPorVenta también rechaza (400) una factura ya aceptada', async () => {
      documentosRepo.findOne.mockResolvedValue({
        id: 'doc-1', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA', estado: EstadoDocumentoElectronico.ACEPTADO, intentos: 1,
      });
      await expect(service.reintentarPorVenta('venta-1', 'neg-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(alegraClient.crearFactura).not.toHaveBeenCalled();
    });
  });

  describe('facturas por id', () => {
    const DOC_ACEPTADO = {
      id: 'doc-1', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA' as const, estado: EstadoDocumentoElectronico.ACEPTADO,
      alegraDocumentId: 'inv-1', cufe: 'cufe-1', numeroCompleto: 'DE1', qrContenido: 'QR-1', intentos: 1,
    };

    it('listarFacturas filtra siempre por negocio y aplica estado, fechas, búsqueda y paginación', async () => {
      const listado = qbEncadenable({ items: [DOC_ACEPTADO], total: 31 });
      const resumen = qbEncadenable({ conteos: [] });
      documentosRepo.createQueryBuilder.mockReturnValueOnce(listado).mockReturnValueOnce(resumen);

      const resultado = await service.listarFacturas('neg-1', {
        estado: EstadoDocumentoElectronico.RECHAZADO, desde: '2026-09-01', hasta: '2026-09-28', q: 'sbox', pagina: 2, porPagina: 10,
      });

      expect(listado.where).toHaveBeenCalledWith('doc.negocioId = :negocioId', { negocioId: 'neg-1' });
      expect(listado.andWhere).toHaveBeenCalledWith('doc.estado = :estado', { estado: 'RECHAZADO' });
      // Fechas y orden sobre la MISMA fecha que muestra la tabla (emisión; creación solo si nunca se emitió) —
      // un reintento reusa el documento, así que `createdAt` puede ser semanas anterior al número vigente.
      expect(listado.andWhere).toHaveBeenCalledWith('COALESCE(doc.fechaEmision, doc.createdAt) >= :desde', { desde: new Date('2026-09-01T05:00:00.000Z') }); // 00:00 en Colombia
      expect(listado.andWhere).toHaveBeenCalledWith('COALESCE(doc.fechaEmision, doc.createdAt) <= :hasta', { hasta: new Date('2026-09-29T04:59:59.999Z') }); // 23:59:59.999 en Colombia
      expect(listado.orderBy).toHaveBeenCalledWith('COALESCE(doc.fechaEmision, doc.createdAt)', 'DESC');
      expect(listado.andWhere).toHaveBeenCalledWith('(doc.numeroCompleto ILIKE :q OR doc.nombreCliente ILIKE :q)', { q: '%sbox%' });
      expect(listado.offset).toHaveBeenCalledWith(10);
      expect(listado.limit).toHaveBeenCalledWith(10);
      expect(resultado).toEqual(expect.objectContaining({ items: [DOC_ACEPTADO], total: 31, pagina: 2, porPagina: 10 }));
    });

    it('el resumen respeta negocio y fechas pero NO el filtro de estado, y agrupa aceptadas/pendientes/rechazadas', async () => {
      const listado = qbEncadenable();
      const resumen = qbEncadenable({
        conteos: [
          { estado: 'ACEPTADO', cantidad: '3' }, { estado: 'ACEPTADO_CON_OBSERVACIONES', cantidad: '1' },
          { estado: 'PENDIENTE', cantidad: '2' }, { estado: 'ERROR', cantidad: '1' }, { estado: 'RECHAZADO', cantidad: '4' },
        ],
      });
      documentosRepo.createQueryBuilder.mockReturnValueOnce(listado).mockReturnValueOnce(resumen);

      const resultado = await service.listarFacturas('neg-1', { estado: EstadoDocumentoElectronico.RECHAZADO });

      expect(resumen.where).toHaveBeenCalledWith('doc.negocioId = :negocioId', { negocioId: 'neg-1' });
      expect(resumen.andWhere).not.toHaveBeenCalledWith('doc.estado = :estado', expect.anything());
      expect(resultado.resumen).toEqual({ aceptados: 4, pendientes: 3, rechazados: 4 });
    });

    it('listarFacturas informa si el negocio tiene algún logo resoluble', async () => {
      documentosRepo.createQueryBuilder.mockReturnValueOnce(qbEncadenable()).mockReturnValueOnce(qbEncadenable());
      logoNegocio.resolverLogo.mockResolvedValue(Buffer.from('png'));
      expect((await service.listarFacturas('neg-1', {})).tieneLogo).toBe(true);
    });

    it('obtenerFactura devuelve documento + venta + QR, sin consultar Alegra si el snapshot ya está completo', async () => {
      documentosRepo.findOne.mockResolvedValue({ ...DOC_ACEPTADO });

      const resultado = await service.obtenerFactura('doc-1', 'neg-1');

      expect(documentosRepo.findOne).toHaveBeenCalledWith({ where: { id: 'doc-1', negocioId: 'neg-1' } });
      expect(ventasRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'venta-1', negocioId: 'neg-1' }, relations: { items: true, pagos: true, cliente: true },
      });
      expect(alegraClient.consultarFactura).not.toHaveBeenCalled();
      expect(resultado.qrDataUrl).toBe('data:image/png;base64,QR');
      expect(facturaPdf.generarQrDataUrl).toHaveBeenCalledWith('QR-1');
    });

    it('obtenerFactura completa una sola vez el snapshot de un documento viejo consultando Alegra', async () => {
      const viejo: any = { ...DOC_ACEPTADO, numeroCompleto: undefined, qrContenido: undefined };
      documentosRepo.findOne.mockResolvedValue(viejo);
      habilitacionRepo.findOneOrFail.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION, ambiente: 'SANDBOX' });
      alegraClient.consultarFactura.mockResolvedValue({
        alegraDocumentId: 'inv-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true,
        cufe: 'cufe-1', fullNumber: 'DE1', prefix: 'DE', number: 1, fecha: '2026-09-01T10:00:00-05:00', qrCodeContent: 'QR-VIEJO',
      });

      await service.obtenerFactura('doc-1', 'neg-1');

      expect(alegraClient.consultarFactura).toHaveBeenCalledTimes(1);
      expect(documentosRepo.save).toHaveBeenCalledWith(expect.objectContaining({ numeroCompleto: 'DE1', qrContenido: 'QR-VIEJO', ambiente: 'SANDBOX' }));
    });

    it('obtenerFactura no se rompe si Alegra falla durante el backfill', async () => {
      documentosRepo.findOne.mockResolvedValue({ ...DOC_ACEPTADO, numeroCompleto: undefined, qrContenido: undefined });
      habilitacionRepo.findOneOrFail.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });
      alegraClient.consultarFactura.mockRejectedValue(new Error('Alegra caído'));

      const resultado = await service.obtenerFactura('doc-1', 'neg-1');

      expect(resultado.documento.id).toBe('doc-1');
      expect(resultado.qrDataUrl).toBeNull();
    });

    it('404 si la factura es de otro negocio (obtener, pdf, xml, reintentar)', async () => {
      documentosRepo.findOne.mockResolvedValue(null);
      await expect(service.obtenerFactura('doc-x', 'neg-1')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.generarPdf('doc-x', 'neg-1')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.descargarXml('doc-x', 'neg-1')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.reintentarFactura('doc-x', 'neg-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(alegraClient.consultarFactura).not.toHaveBeenCalled();
      expect(alegraClient.crearFactura).not.toHaveBeenCalled();
    });

    it('generarPdf responde 409 si todavía no hay CUFE', async () => {
      documentosRepo.findOne.mockResolvedValue({ ...DOC_ACEPTADO, estado: EstadoDocumentoElectronico.PENDIENTE, cufe: undefined });
      await expect(service.generarPdf('doc-1', 'neg-1')).rejects.toBeInstanceOf(ConflictException);
      expect(facturaPdf.generar).not.toHaveBeenCalled();
    });

    it('generarPdf responde 409 para documentos DEE_POS legados', async () => {
      documentosRepo.findOne.mockResolvedValue({ ...DOC_ACEPTADO, tipo: 'DEE_POS' });
      await expect(service.generarPdf('doc-1', 'neg-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('generarPdf arma el PDF con documento, venta y logo del negocio', async () => {
      documentosRepo.findOne.mockResolvedValue({ ...DOC_ACEPTADO });
      logoNegocio.resolverLogo.mockResolvedValue(Buffer.from('logo'));

      const resultado = await service.generarPdf('doc-1', 'neg-1');

      expect(facturaPdf.generar).toHaveBeenCalledWith({
        documento: expect.objectContaining({ id: 'doc-1' }), venta: expect.objectContaining({ id: 'venta-1' }), logo: Buffer.from('logo'),
      });
      expect(resultado.nombreArchivo).toBe('DE1.pdf');
    });

    it('descargarXml descarga el XML de la URL temporal de Alegra y lo devuelve (la URL nunca sale del backend)', async () => {
      documentosRepo.findOne.mockResolvedValue({ ...DOC_ACEPTADO });
      habilitacionRepo.findOneOrFail.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });
      alegraClient.consultarFactura.mockResolvedValue({ alegraDocumentId: 'inv-1', status: 'SENT', isFinal: true, urlXml: 'https://s3/x.xml?firma' });
      const fetchOriginal = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new TextEncoder().encode('<Invoice/>').buffer }) as any;

      try {
        const resultado = await service.descargarXml('doc-1', 'neg-1');
        expect(global.fetch).toHaveBeenCalledWith('https://s3/x.xml?firma');
        expect(resultado).toEqual({ nombreArchivo: 'DE1.xml', contenido: Buffer.from('<Invoice/>') });
      } finally {
        global.fetch = fetchOriginal;
      }
    });

    it('descargarXml usa consultarDocumento (legado) para documentos DEE_POS', async () => {
      documentosRepo.findOne.mockResolvedValue({ ...DOC_ACEPTADO, tipo: 'DEE_POS' });
      habilitacionRepo.findOneOrFail.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });
      alegraClient.consultarDocumento.mockResolvedValue({ status: 'REGISTERED', urlXml: 'https://s3/pos.xml' });
      const fetchOriginal = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new TextEncoder().encode('<x/>').buffer }) as any;

      try {
        await service.descargarXml('doc-1', 'neg-1');
        expect(alegraClient.consultarDocumento).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'DEE_POS' }));
        expect(alegraClient.consultarFactura).not.toHaveBeenCalled();
      } finally {
        global.fetch = fetchOriginal;
      }
    });

    it('reintentarFactura rechaza (400) una factura ya aceptada — evita emitir una segunda factura real', async () => {
      documentosRepo.findOne.mockResolvedValue({ ...DOC_ACEPTADO });
      await expect(service.reintentarFactura('doc-1', 'neg-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(alegraClient.crearFactura).not.toHaveBeenCalled();
    });

    it('reintentarFactura rechaza (400) un pendiente que ya está en curso ante la DIAN (tiene trackingReference)', async () => {
      documentosRepo.findOne.mockResolvedValue({
        ...DOC_ACEPTADO, estado: EstadoDocumentoElectronico.PENDIENTE, trackingReference: { documentId: 'inv-1' },
      });
      await expect(service.reintentarFactura('doc-1', 'neg-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reintentarFactura permite reintentar una rechazada', async () => {
      documentosRepo.findOne.mockResolvedValue({ ...DOC_ACEPTADO, estado: EstadoDocumentoElectronico.RECHAZADO });
      habilitacionRepo.findOneOrFail.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });

      await service.reintentarFactura('doc-1', 'neg-1');

      expect(alegraClient.crearFactura).toHaveBeenCalled();
    });

    it('resumenPorVentas devuelve id y estado del documento de cada venta del negocio', async () => {
      documentosRepo.find.mockResolvedValue([{ id: 'doc-1', ventaId: 'venta-1', estado: EstadoDocumentoElectronico.ACEPTADO }]);

      const mapa = await service.resumenPorVentas('neg-1', ['venta-1', 'venta-2']);

      expect(documentosRepo.find).toHaveBeenCalledWith({
        where: { negocioId: 'neg-1', ventaId: expect.anything(), tipo: In(['FACTURA', 'DEE_POS']) },
        select: { id: true, ventaId: true, estado: true },
      });
      expect(mapa.get('venta-1')).toEqual({ id: 'doc-1', estado: 'ACEPTADO' });
      expect(mapa.has('venta-2')).toBe(false);
    });

    it('resumenPorVentas no consulta la DB si no hay ventas', async () => {
      expect((await service.resumenPorVentas('neg-1', [])).size).toBe(0);
      expect(documentosRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('contingencia (fase 6a)', () => {
    const HAB = {
      ...HABILITACION_CON_RESOLUCION,
      contingenciaPrefijo: 'CONT',
      contingenciaResolucionNumero: '18764000009999',
      contingenciaFechaInicio: '2026-01-01',
      contingenciaFechaFin: '2028-01-01',
      contingenciaRangoDesde: 1,
      contingenciaRangoHasta: 5000,
    };
    const VENTA = { id: 'venta-1', negocioId: 'neg-1', tipoComprobanteEmitido: 'FACTURA_ELECTRONICA' };

    beforeEach(() => {
      habilitacionRepo.findOne.mockResolvedValue({ ...HAB });
      ventasRepo.findOneOrFail.mockResolvedValue(
        ventaDePrueba({ negocioId: 'neg-1', subtotal: 10000, impuestoTotal: 1900, total: 11900 } as never),
      );
      negociosRepo.findOneOrFail.mockResolvedValue({ nit: '900123456', nombre: 'Tienda' });
    });

    it('con un período abierto no llama a Alegra: congela la resolución de contingencia y deja PENDIENTE', async () => {
      contingencia.periodoActivo.mockResolvedValue({ id: 'per-1', fin: null });
      contingencia.asignarNumero.mockResolvedValue({ numero: 501, habilitacion: { ...HAB } });

      await service.emitirDocumento(VENTA);

      expect(alegraClient.crearFactura).not.toHaveBeenCalled();
      const guardado = documentosRepo.save.mock.calls.at(-1)[0];
      expect(guardado).toEqual(
        expect.objectContaining({
          periodoContingenciaId: 'per-1',
          transcritaDeTalonario: false,
          estado: 'PENDIENTE',
          prefijo: 'CONT',
          numero: 501,
          numeroCompleto: 'CONT501',
          resolucionNumero: '18764000009999',
          resolucionRangoDesde: 1,
          resolucionRangoHasta: 5000,
          emisorNit: '900123456',
        }),
      );
      expect(guardado.fechaEmision).toBeInstanceOf(Date);
      expect(guardado.qrContenido).toContain('NumFac: CONT501');
      expect(guardado.qrContenido).toContain('NitFac: 900123456');
      expect(realtimeGateway.emitToNegocio).toHaveBeenCalledWith('neg-1', 'documentos-electronicos:cambio', expect.anything());
    });

    it('una transcripción de talonario usa el número y la fecha del papel y no asigna número', async () => {
      const fecha = new Date('2026-09-28T15:00:00Z');
      await service.emitirDocumento(VENTA, { talonario: { numero: 77, fecha, periodoId: 'per-9' } });

      expect(contingencia.asignarNumero).not.toHaveBeenCalled();
      expect(alegraClient.crearFactura).not.toHaveBeenCalled();
      expect(documentosRepo.save.mock.calls.at(-1)[0]).toEqual(
        expect.objectContaining({
          periodoContingenciaId: 'per-9',
          transcritaDeTalonario: true,
          numero: 77,
          numeroCompleto: 'CONT77',
          fechaEmision: fecha,
        }),
      );
    });

    it('venta sin conexión (6b): transcrita false y la resolución del bloque, aunque la habilitación ya tenga otra', async () => {
      const fecha = new Date('2026-09-28T15:00:00Z');
      await service.emitirDocumento(VENTA, {
        talonario: {
          numero: 7,
          fecha,
          periodoId: 'per-ep',
          transcrita: false,
          resolucion: { numero: '18764000000001', prefijo: 'VIEJ', fechaInicio: '2025-01-01', fechaFin: '2027-01-01', rangoDesde: 1, rangoHasta: 100 },
        },
      });
      expect(documentosRepo.save.mock.calls.at(-1)[0]).toEqual(
        expect.objectContaining({
          periodoContingenciaId: 'per-ep',
          transcritaDeTalonario: false,
          numero: 7,
          numeroCompleto: 'VIEJ7',
          prefijo: 'VIEJ',
          resolucionNumero: '18764000000001',
          resolucionRangoHasta: 100,
          fechaEmision: fecha,
        }),
      );
    });

    it('transmite un documento de contingencia con documentType "04", su número fijo y la resolución congelada', async () => {
      const documento = {
        id: 'doc-1',
        negocioId: 'neg-1',
        ventaId: 'venta-1',
        tipo: 'FACTURA',
        estado: 'PENDIENTE',
        intentos: 0,
        periodoContingenciaId: 'per-1',
        prefijo: 'CONT',
        numero: 501,
        numeroCompleto: 'CONT501',
        fechaEmision: new Date('2026-09-28T15:00:00Z'),
        resolucionNumero: '18764000009999',
        resolucionFechaInicio: '2026-01-01',
        resolucionFechaFin: '2028-01-01',
        resolucionRangoDesde: 1,
        resolucionRangoHasta: 5000,
      } as unknown as DocumentoElectronico;
      alegraClient.crearFactura.mockResolvedValue({
        alegraDocumentId: 'inv-9',
        cufe: 'cude-1',
        status: 'SENT',
        legalStatus: 'ACCEPTED',
        isFinal: true,
        fecha: '2026-09-29T10:00:00-05:00',
      });

      await service.intentarEmitir(documento, { ...HAB, siguienteNumero: 40 } as never);

      const params = alegraClient.crearFactura.mock.calls[0][0];
      expect(params.documentType).toBe('04');
      expect(params.number).toBe(501);
      expect(params.additionalDocumentReference).toEqual({ number: 'CONT501', issueDate: '2026-09-28' });
      expect(params.invoicePeriod).toEqual({ startDate: '2026-09-28', endDate: '2026-09-28' });
      expect(params.resolution).toEqual(
        expect.objectContaining({ prefix: 'CONT', resolutionNumber: '18764000009999', technicalKey: '' }),
      );
      expect(documento.estado).toBe('ACEPTADO');
      expect(documento.cufe).toBe('cude-1');
      // La fecha de la factura de papel no se pisa con la de transmisión, y el consecutivo de la FE no avanza.
      expect(documento.fechaEmision).toEqual(new Date('2026-09-28T15:00:00Z'));
      expect(habilitacionRepo.save).not.toHaveBeenCalled();
    });

    it('una indisponibilidad de Alegra en una emisión normal la registra', async () => {
      alegraClient.crearFactura.mockRejectedValue(new AlegraNoDisponibleError('fetch failed'));
      const documento = {
        id: 'doc-2', negocioId: 'neg-1', ventaId: 'venta-1', estado: 'PENDIENTE', intentos: 0, periodoContingenciaId: null,
      } as unknown as DocumentoElectronico;
      await service.intentarEmitir(documento, { ...HAB } as never);
      expect(contingencia.registrarIndisponibilidad).toHaveBeenCalled();
    });

    it('un rechazo no cuenta como indisponibilidad; una respuesta cualquiera corta la racha', async () => {
      alegraClient.crearFactura.mockResolvedValue({ alegraDocumentId: 'inv-1', status: 'SENT', legalStatus: 'REJECTED', isFinal: true });
      const documento = {
        id: 'doc-3', negocioId: 'neg-1', ventaId: 'venta-1', estado: 'PENDIENTE', intentos: 0, periodoContingenciaId: null,
      } as unknown as DocumentoElectronico;
      await service.intentarEmitir(documento, { ...HAB } as never);
      expect(contingencia.registrarIndisponibilidad).not.toHaveBeenCalled();
      expect(contingencia.registrarDisponibilidad).toHaveBeenCalled();
    });

    it('reconciliarPendientes no transmite documentos de un período todavía abierto', async () => {
      documentosRepo.find.mockResolvedValue([{ id: 'doc-1', negocioId: 'neg-1', estado: 'PENDIENTE', periodoContingenciaId: 'per-1' }]);
      contingencia.estaAbierto.mockResolvedValue(true);
      await service.reconciliarPendientes();
      expect(alegraClient.crearFactura).not.toHaveBeenCalled();
    });

    it('reconciliarPendientes transmite los de un período ya cerrado', async () => {
      documentosRepo.find.mockResolvedValue([
        {
          id: 'doc-1', negocioId: 'neg-1', ventaId: 'venta-1', estado: 'PENDIENTE', intentos: 0, periodoContingenciaId: 'per-1',
          prefijo: 'CONT', numero: 3, numeroCompleto: 'CONT3', fechaEmision: new Date('2026-09-28T15:00:00Z'),
        },
      ]);
      contingencia.estaAbierto.mockResolvedValue(false);
      await service.reconciliarPendientes();
      expect(alegraClient.crearFactura).toHaveBeenCalledWith(expect.objectContaining({ documentType: '04', number: 3 }));
    });

    it('reintentar un documento de un período abierto es 400', async () => {
      documentosRepo.findOne.mockResolvedValue({ id: 'doc-1', negocioId: 'neg-1', estado: 'PENDIENTE', periodoContingenciaId: 'per-1' });
      contingencia.estaAbierto.mockResolvedValue(true);
      await expect(service.reintentarFactura('doc-1', 'neg-1')).rejects.toThrow('contingencia sigue abierta');
    });

    it('verificarFinContingenciasAutomaticas cierra un período automático si Alegra ya responde', async () => {
      contingencia.periodosAutomaticosAbiertos.mockResolvedValue([{ id: 'per-1', negocioId: 'neg-1' }]);
      alegraClient.consultarCompania.mockResolvedValue({ posAutorizado: true });
      await service.verificarFinContingenciasAutomaticas();
      expect(contingencia.finalizar).toHaveBeenCalledWith('neg-1', null);
    });

    it('verificarFinContingenciasAutomaticas deja abierto si Alegra sigue caído', async () => {
      contingencia.periodosAutomaticosAbiertos.mockResolvedValue([{ id: 'per-1', negocioId: 'neg-1' }]);
      alegraClient.consultarCompania.mockRejectedValue(new Error('fetch failed'));
      await service.verificarFinContingenciasAutomaticas();
      expect(contingencia.finalizar).not.toHaveBeenCalled();
    });

    it('la alerta de 48 h por created_at excluye los documentos de contingencia (tienen su propio plazo)', async () => {
      await service.alertarDocumentosVencidos();
      expect(qbWhereMock.andWhere).toHaveBeenCalledWith('doc.periodo_contingencia_id IS NULL');
    });
  });

  describe('correo de la factura (fase 7)', () => {
    const ATTACHED = '<AttachedDocument><![CDATA[<cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>]]></AttachedDocument>';
    const fetchOriginal = global.fetch;
    /** El envío automático es "dispara y olvida": hay que dejar correr las promesas pendientes. */
    const esperarEnvio = async () => {
      for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    };
    const docAceptado = (overrides: Record<string, unknown> = {}): any => ({
      id: 'doc-1', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA', estado: EstadoDocumentoElectronico.ACEPTADO,
      cufe: 'cufe-1', alegraDocumentId: 'inv-1', qrContenido: 'qr', numero: 120, prefijo: 'FE', numeroCompleto: 'FE120',
      ambiente: 'PRODUCCION', emisorNit: '900.123.456-7', emisorRazonSocial: 'El Clavo SAS', resolucionNumero: '187',
      emisorDireccion: 'Calle 1', fechaEmision: new Date(), total: 32130, correoEstado: null, intentos: 1,
      ...overrides,
    });
    const ventaConCorreo = (email: string | null = 'ana@correo.co') =>
      ventaDePrueba({ cliente: { nombre: 'Ana', documentoIdentidad: '1047', tipoDocumentoIdentidad: '13', email } } as any);

    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(ATTACHED).buffer,
      }) as unknown as typeof fetch;
      alegraClient.consultarFactura.mockResolvedValue({
        alegraDocumentId: 'inv-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true, urlAttachedDocument: 'https://s3/attached.xml',
      });
      habilitacionRepo.findOneOrFail.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });
      negociosRepo.findOneOrFail.mockResolvedValue({ id: 'neg-1', nombre: 'El Clavo', nit: '900123456-7', email: 'negocio@clavo.co' });
      ventasRepo.findOne.mockResolvedValue(ventaConCorreo());
      ventasRepo.findOneOrFail.mockResolvedValue(ventaConCorreo());
    });
    afterEach(() => {
      global.fetch = fetchOriginal;
    });

    it('al aceptarse en producción envía el ZIP DIAN al correo del cliente y registra ENVIADO', async () => {
      const documento = docAceptado({ estado: EstadoDocumentoElectronico.PENDIENTE });
      alegraClient.crearFactura.mockResolvedValue({ alegraDocumentId: 'inv-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true });
      documentosRepo.findOne.mockImplementation(async () => documento);

      await service.intentarEmitir(documento, { ...HABILITACION_CON_RESOLUCION } as any);
      await esperarEnvio();

      expect(documentosRepo.update).toHaveBeenCalledWith({ id: 'doc-1', correoEstado: expect.anything() }, { correoEstado: 'ENVIANDO' });
      expect(emailService.enviar).toHaveBeenCalledTimes(1);
      const envio = emailService.enviar.mock.calls[0][0];
      expect(envio.to).toBe('ana@correo.co');
      expect(envio.subject).toBe(`900123456;${documento.emisorRazonSocial};${documento.numeroCompleto};01;El Clavo`);
      expect(envio.replyTo).toBe('negocio@clavo.co');
      expect(envio.nombreRemitente).toBe('El Clavo');
      expect(envio.adjuntos[0].filename).toBe(`${documento.numeroCompleto}.zip`);
      const archivos = unzipSync(new Uint8Array(envio.adjuntos[0].content));
      expect(Object.keys(archivos).sort()).toEqual([`${documento.numeroCompleto}.pdf`, `${documento.numeroCompleto}.xml`]);
      expect(documentosRepo.update).toHaveBeenCalledWith('doc-1', {
        correoEstado: 'ENVIADO', correoDestinatario: 'ana@correo.co', correoEnviadoEn: expect.any(Date), correoError: null,
      });
    });

    it('no envía en sandbox', async () => {
      const documento = docAceptado({ estado: EstadoDocumentoElectronico.PENDIENTE, ambiente: 'SANDBOX' });
      await service.intentarEmitir(documento, { ...HABILITACION_CON_RESOLUCION, ambiente: 'SANDBOX' } as any);
      await esperarEnvio();
      expect(emailService.enviar).not.toHaveBeenCalled();
    });

    it('no envía si el cliente no tiene correo', async () => {
      ventasRepo.findOne.mockResolvedValue(ventaConCorreo(null));
      documentosRepo.findOne.mockResolvedValue(docAceptado({ estado: EstadoDocumentoElectronico.PENDIENTE }));
      habilitacionRepo.findOne.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });
      await service.procesarWebhookAlegra({ documentId: 'inv-1', legalStatus: 'ACCEPTED' });
      await esperarEnvio();
      expect(documentosRepo.update).not.toHaveBeenCalled();
      expect(emailService.enviar).not.toHaveBeenCalled();
    });

    it('no envía dos veces: si otro proceso ya reclamó el envío no llama a Resend', async () => {
      documentosRepo.update.mockResolvedValueOnce({ affected: 0 });
      documentosRepo.findOne.mockResolvedValue(docAceptado({ estado: EstadoDocumentoElectronico.PENDIENTE }));
      habilitacionRepo.findOne.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });
      await service.procesarWebhookAlegra({ documentId: 'inv-1', legalStatus: 'ACCEPTED' });
      await esperarEnvio();
      expect(emailService.enviar).not.toHaveBeenCalled();
    });

    it('el webhook ACCEPTED dispara el envío; si Resend falla registra FALLIDO sin lanzar', async () => {
      emailService.enviar.mockResolvedValue({ ok: false, error: 'domain not verified' });
      const documento = docAceptado({ estado: EstadoDocumentoElectronico.PENDIENTE });
      documentosRepo.findOne.mockResolvedValue(documento);
      habilitacionRepo.findOne.mockResolvedValue({ ...HABILITACION_CON_RESOLUCION });

      await service.procesarWebhookAlegra({ documentId: 'inv-1', legalStatus: 'ACCEPTED' });
      await esperarEnvio();

      expect(emailService.enviar).toHaveBeenCalledTimes(1);
      expect(documentosRepo.update).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({ correoEstado: 'FALLIDO', correoError: 'domain not verified' }),
      );
    });

    it('si el ZIP supera 2 MB registra FALLIDO sin llamar a Resend', async () => {
      facturaPdf.generar.mockResolvedValue(randomBytes(3 * 1024 * 1024));
      documentosRepo.findOne.mockResolvedValue(docAceptado());

      await service.enviarCorreoFactura('doc-1', 'neg-1');

      expect(emailService.enviar).not.toHaveBeenCalled();
      expect(documentosRepo.update).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({ correoEstado: 'FALLIDO', correoError: expect.stringContaining('2 MB') }),
      );
    });

    it('reenvío manual: usa el correo escrito aunque el cliente tenga otro, y funciona en sandbox', async () => {
      documentosRepo.findOne.mockResolvedValue(docAceptado({ ambiente: 'SANDBOX', correoEstado: 'ENVIADO' }));

      await service.enviarCorreoFactura('doc-1', 'neg-1', ' otro@correo.co ');

      expect(emailService.enviar).toHaveBeenCalledWith(expect.objectContaining({ to: 'otro@correo.co' }));
      expect(documentosRepo.update).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({ correoEstado: 'ENVIADO', correoDestinatario: 'otro@correo.co' }),
      );
    });

    it('reenvío manual: 409 si la factura no está aceptada', async () => {
      documentosRepo.findOne.mockResolvedValue(docAceptado({ estado: EstadoDocumentoElectronico.RECHAZADO }));
      await expect(service.enviarCorreoFactura('doc-1', 'neg-1')).rejects.toBeInstanceOf(ConflictException);
      expect(emailService.enviar).not.toHaveBeenCalled();
    });

    it('reenvío manual: 400 si no hay correo del cliente ni escrito', async () => {
      ventasRepo.findOne.mockResolvedValue(ventaConCorreo(null));
      documentosRepo.findOne.mockResolvedValue(docAceptado());
      await expect(service.enviarCorreoFactura('doc-1', 'neg-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
  describe('notas crédito de devoluciones', () => {
    const facturaAceptada = () => ({
      id: 'fac-1', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'FACTURA', estado: EstadoDocumentoElectronico.ACEPTADO,
      prefijo: 'DE', numero: 17, numeroCompleto: 'DE17', fechaEmision: new Date('2026-10-01T15:00:00Z'), cufe: 'cufe-fac',
    });
    const devolucion = () => ({
      id: 'dev-1', negocioId: 'neg-1', ventaId: 'venta-1', numeroCompleto: 'DEV-1', motivo: 'Defectuoso', total: 11_900,
      baseTotal: 10_000, impuestoTotal: 1_900, descuentoVentaTotal: 0,
      items: [{ nombreProducto: 'Taladro', cantidad: 1, precioUnitario: 10_000, base: 10_000, impuesto: 1_900, descuentoVenta: 0, total: 11_900 }],
      reembolsos: [{ forma: 'EFECTIVO', monto: 11_900 }],
    });
    const habilitacion = (over: Record<string, unknown> = {}) => ({ ...HABILITACION_CON_RESOLUCION, siguienteNumeroNotaCredito: 4, ...over });

    beforeEach(() => {
      devolucionesRepo.findOne.mockResolvedValue(devolucion());
      devolucionesRepo.findOneOrFail.mockResolvedValue(devolucion());
      documentosRepo.findOne.mockResolvedValue(facturaAceptada());
      documentosRepo.findOneOrFail.mockResolvedValue(facturaAceptada());
      habilitacionRepo.findOne.mockResolvedValue(habilitacion());
      alegraClient.crearNotaCredito.mockResolvedValue({
        alegraDocumentId: 'nc-1', cude: 'cude-1', fullNumber: 'NC4', number: 4, prefix: 'NC', qrCodeContent: 'qr-nc',
        status: 'CLOSED', legalStatus: 'ACCEPTED', isFinal: true,
      });
    });

    it('crea el documento NOTA_CREDITO ligado a la factura y lo emite con prefijo NC y su consecutivo propio', async () => {
      await service.registrarNotaCredito('dev-1', 'neg-1', { quedaTotal: false, esPrimeraDevolucion: true });

      expect(documentosRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'NOTA_CREDITO', devolucionId: 'dev-1', facturaDocumentoId: 'fac-1', ventaId: 'venta-1', conceptoNotaCredito: '1',
        }),
      );
      expect(alegraClient.crearNotaCredito).toHaveBeenCalledWith(
        expect.objectContaining({
          prefix: 'NC',
          number: 4,
          conceptCode: '1',
          documentoAsociado: { prefix: 'DE', number: 17, documentType: '01', date: '2026-10-01', uuid: 'cufe-fac' },
        }),
      );
      expect(documentosRepo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          estado: EstadoDocumentoElectronico.ACEPTADO, cude: 'cude-1', numeroCompleto: 'NC4', qrContenido: 'qr-nc', total: 11_900,
        }),
      );
      expect(habilitacionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ siguienteNumeroNotaCredito: 5 }));
    });

    it('concepto 2 (anulación) cuando la devolución es la primera y deja la venta en total', async () => {
      await service.registrarNotaCredito('dev-1', 'neg-1', { quedaTotal: true, esPrimeraDevolucion: true });
      expect(alegraClient.crearNotaCredito).toHaveBeenCalledWith(expect.objectContaining({ conceptCode: '2' }));
    });

    it('sin consecutivo previo arranca en 1', async () => {
      habilitacionRepo.findOne.mockResolvedValue(habilitacion({ siguienteNumeroNotaCredito: null }));
      await service.registrarNotaCredito('dev-1', 'neg-1', { quedaTotal: false, esPrimeraDevolucion: true });
      expect(alegraClient.crearNotaCredito).toHaveBeenCalledWith(expect.objectContaining({ number: 1 }));
    });

    it('si la factura no está aceptada no crea nota crédito', async () => {
      documentosRepo.findOne.mockResolvedValue({ ...facturaAceptada(), estado: EstadoDocumentoElectronico.PENDIENTE });
      await service.registrarNotaCredito('dev-1', 'neg-1', { quedaTotal: false, esPrimeraDevolucion: true });
      expect(documentosRepo.create).not.toHaveBeenCalled();
      expect(alegraClient.crearNotaCredito).not.toHaveBeenCalled();
    });

    it('si Alegra no responde, la NC queda PENDIENTE con el error y el consecutivo no avanza', async () => {
      alegraClient.crearNotaCredito.mockRejectedValue(new AlegraNoDisponibleError('caído'));
      await service.registrarNotaCredito('dev-1', 'neg-1', { quedaTotal: false, esPrimeraDevolucion: true });
      expect(documentosRepo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ tipo: 'NOTA_CREDITO', estado: EstadoDocumentoElectronico.PENDIENTE, errorMensaje: 'caído' }),
      );
      expect(habilitacionRepo.save).not.toHaveBeenCalledWith(expect.objectContaining({ siguienteNumeroNotaCredito: 5 }));
    });

    it('el reintento (intentarEmitir) de un documento NOTA_CREDITO usa crearNotaCredito, nunca crearFactura', async () => {
      const documento = {
        id: 'nc-doc', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'NOTA_CREDITO', estado: EstadoDocumentoElectronico.RECHAZADO,
        devolucionId: 'dev-1', facturaDocumentoId: 'fac-1', conceptoNotaCredito: '2', intentos: 1, periodoContingenciaId: null,
      } as unknown as DocumentoElectronico;
      await service.intentarEmitir(documento, habilitacion() as unknown as HabilitacionFacturacionElectronica);
      expect(alegraClient.crearFactura).not.toHaveBeenCalled();
      expect(alegraClient.crearNotaCredito).toHaveBeenCalledWith(expect.objectContaining({ conceptCode: '2' }));
    });

    it('consultarPendiente de una NC en curso consulta /credit-notes', async () => {
      const documento = {
        id: 'nc-doc', negocioId: 'neg-1', ventaId: 'venta-1', tipo: 'NOTA_CREDITO', estado: EstadoDocumentoElectronico.PENDIENTE,
        trackingReference: { documentId: 'nc-1' }, ultimoIntentoEn: null, periodoContingenciaId: null,
      };
      documentosRepo.find.mockResolvedValue([documento]);
      alegraClient.consultarNotaCredito.mockResolvedValue({
        alegraDocumentId: 'nc-1', status: 'CLOSED', legalStatus: 'ACCEPTED', isFinal: true, cude: 'cude-1',
      });
      await service.reconciliarPendientes();
      expect(alegraClient.consultarFactura).not.toHaveBeenCalled();
      expect(alegraClient.consultarNotaCredito).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'nc-1' }));
      expect(documentosRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estado: EstadoDocumentoElectronico.ACEPTADO, cude: 'cude-1' }),
      );
    });
  });
});
