import { AlegraClientService } from './alegra-client.service';

describe('AlegraClientService', () => {
  let service: AlegraClientService;
  const fetchMock = jest.fn();

  beforeEach(() => {
    service = new AlegraClientService();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  it('crearCompania envía identification/dv/address anidado y devuelve el companyId (shape real confirmado en vivo)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ company: { id: 'company-1' } }) });

    const resultado = await service.crearCompania({
      token: 'reseller-token',
      baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
      identification: '900123456',
      dv: '5',
      identificationType: '31',
      organizationType: 1,
      razonSocial: 'Mascotas Pet Shop',
      direccion: 'Calle 1 # 2-3',
      ciudadCodigo: '11001',
      departamentoCodigo: '11',
      useAlegraCertificate: true,
    });

    expect(resultado).toEqual({ companyId: 'company-1' });
    const [, opciones] = fetchMock.mock.calls[0];
    const body = JSON.parse(opciones.body);
    expect(body.identification).toBe('900123456');
    expect(body.dv).toBe('5');
    expect(body.address).toEqual({ address: 'Calle 1 # 2-3', city: '11001', department: '11', country: 'CO' });
    expect(body.nit).toBeUndefined();
  });

  it('crearCompania omite la clave email en vez de mandar null cuando el negocio no tiene correo (confirmado en vivo: Alegra rechaza email:null)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ company: { id: 'company-1' } }) });

    await service.crearCompania({
      token: 'reseller-token',
      baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
      identification: '900123456',
      dv: '5',
      identificationType: '31',
      organizationType: 1,
      razonSocial: 'Mascotas Pet Shop',
      direccion: 'Calle 1 # 2-3',
      ciudadCodigo: '11001',
      departamentoCodigo: '11',
      useAlegraCertificate: true,
    });

    const [, opciones] = fetchMock.mock.calls[0];
    const body = JSON.parse(opciones.body);
    expect('email' in body).toBe(false);
  });

  it('crearTestSet envía type/governmentId y devuelve el testSetId (shape real confirmado en vivo)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ testSet: { id: 'testset-1', governmentId: 'gov-1', type: 'pos', status: 'ACCEPTED' } }),
    });

    const resultado = await service.crearTestSet({
      token: 'reseller-token',
      baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
      companyId: 'company-1',
      tipo: 'pos',
      governmentId: 'a70562e0-631e-4ceb-aa65-36887b57dc17',
    });

    expect(resultado).toEqual({ testSetId: 'testset-1' });
    const [, opciones] = fetchMock.mock.calls[0];
    const body = JSON.parse(opciones.body);
    expect(body).toEqual({
      company: { id: 'company-1' },
      type: 'pos',
      governmentId: 'a70562e0-631e-4ceb-aa65-36887b57dc17',
    });
  });

  it('consultarCompania lee governmentStatus[tipo] (shape real confirmado en vivo — GET /companies/{id})', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ company: { id: 'company-1', governmentStatus: { invoices: 'AUTHORIZED' } } }),
    });

    const resultado = await service.consultarCompania({
      token: 'reseller-token',
      baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
      companyId: 'company-1',
      tipo: 'invoices',
    });

    expect(resultado).toEqual({ posAutorizado: true });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/companies/company-1'), expect.anything());
  });

  it('consultarCompania devuelve posAutorizado false si todavía no está AUTHORIZED', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ company: { id: 'company-1', governmentStatus: {} } }),
    });

    const resultado = await service.consultarCompania({
      token: 'reseller-token',
      baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
      companyId: 'company-1',
      tipo: 'invoices',
    });

    expect(resultado).toEqual({ posAutorizado: false });
  });

  it('consultarCompania distingue governmentStatus.pos de governmentStatus.invoices — habilitaciones independientes por tipo de documento', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ company: { id: 'company-1', governmentStatus: { pos: 'AUTHORIZED', invoices: 'PENDING' } } }),
    });

    const resultado = await service.consultarCompania({
      token: 'reseller-token',
      baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
      companyId: 'company-1',
      tipo: 'invoices',
    });

    expect(resultado).toEqual({ posAutorizado: false });
  });

  it('crearDocumentoEquivalentePos manda number como string y devuelve cude/status/legalStatus (shape real confirmado en vivo)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        equivalentDocument: { id: 'doc-1', cude: 'cude-abc', status: 'SENT', legalStatus: 'ACCEPTED' },
        files: { xml: 'https://s3/doc.xml', zip: 'https://s3/doc.zip' },
      }),
    });

    const resultado = await service.crearDocumentoEquivalentePos({
      token: 'reseller-token',
      baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
      companyId: 'company-1',
      number: '1',
      resolution: {
        prefix: 'DE',
        resolutionNumber: '18760000001',
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        minNumber: 1,
        maxNumber: 100000,
        technicalKey: 'abc123',
      },
      items: [
        {
          description: 'Producto',
          quantity: 1,
          price: 10000,
          unitCode: '94',
          code: { identificationId: '999', id: '999' },
          subtotal: 10000,
          total: 10000,
          taxAmount: 0,
          taxes: [{ taxCode: '01', taxAmount: 0, taxPercentage: '0.00', taxableAmount: 10000 }],
        },
      ],
      totalAmounts: {
        total: 10000,
        grossTotal: 10000,
        taxableTotal: 10000,
        taxTotal: 0,
        payableTotal: 10000,
        discountTotal: 0,
        chargeTotal: 0,
        advanceTotal: 0,
        currencyCode: 'COP',
      },
      payments: [{ type: 'CASH', amount: 10000, paymentForm: '1', paymentMethod: '10', paymentDueDate: '2026-09-01' }],
    });

    expect(resultado).toEqual({
      alegraDocumentId: 'doc-1',
      cude: 'cude-abc',
      status: 'SENT',
      legalStatus: 'ACCEPTED',
    });
    const [, opciones] = fetchMock.mock.calls[0];
    const body = JSON.parse(opciones.body);
    expect(typeof body.number).toBe('string');
    expect(body.resolution.resolutionNumber).toBe('18760000001');
  });

  it('consultarDocumento usa /equivalent-documents/{id} para DEE_POS y lee files.xml (shape real confirmado en vivo)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        equivalentDocument: { status: 'SENT', legalStatus: 'ACCEPTED' },
        files: { xml: 'https://s3/doc.xml' },
      }),
    });

    const resultado = await service.consultarDocumento({
      token: 'reseller-token',
      baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
      alegraDocumentId: 'doc-1',
      tipo: 'DEE_POS',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/equivalent-documents/doc-1'),
      expect.anything(),
    );
    expect(resultado).toEqual({ status: 'SENT', legalStatus: 'ACCEPTED', urlXml: 'https://s3/doc.xml', urlPdf: undefined });
  });

  it('consultarDocumento usa /invoices/{id} para FACTURA', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ invoice: { status: 'SENT', legalStatus: 'ACCEPTED' }, files: {} }),
    });

    await service.consultarDocumento({
      token: 'reseller-token',
      baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
      alegraDocumentId: 'doc-2',
      tipo: 'FACTURA',
    });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/invoices/doc-2'), expect.anything());
  });

  it('lanza BadGatewayException con el detalle de errores si Alegra rechaza la creación de la compañía', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ errors: [{ message: 'NIT inválido' }] }),
    });

    await expect(
      service.crearCompania({
        token: 'reseller-token',
        baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
        identification: '000',
        dv: '0',
        identificationType: '31',
        organizationType: 1,
        razonSocial: 'X',
        direccion: 'X',
        ciudadCodigo: '11001',
        departamentoCodigo: '11',
        useAlegraCertificate: true,
      }),
    ).rejects.toThrow('NIT inválido');
  });

  describe('crearFactura', () => {
    const RESOLUCION = {
      prefix: 'DE', resolutionNumber: '18760000001', startDate: '2026-01-01',
      endDate: '2027-01-01', minNumber: 1, maxNumber: 100000, technicalKey: 'abc123',
    };
    const CUSTOMER = { identificationNumber: '222222222222', identificationType: '43', name: 'Consumidor Final' };
    const ITEM = {
      description: 'Free Miau', quantity: 1, price: 45000, unitCode: '94', code: '999',
      subtotal: 45000, total: 53550, taxAmount: 8550,
      taxes: [{ taxCode: '01', taxAmount: 8550, taxPercentage: '19.00', taxableAmount: 45000 }],
    };
    const TOTALES = {
      grossTotal: 45000, taxableTotal: 45000, taxTotal: 8550, payableTotal: 53550,
      discountTotal: 0, chargeTotal: 0, advanceTotal: 0,
    };
    const PAGOS = [{ paymentForm: '1', paymentMethod: '10', paymentDueDate: '2026-09-01' }];

    it('llama a POST /invoices con el shape confirmado con validate_co_payload (2026-09-01) y mapea la respuesta', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          invoice: {
            id: 'inv-1', cufe: 'cufe-abc', fullNumber: 'DE6', date: '2026-09-01T10:00:00-05:00',
            status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true,
            governmentResponse: { code: '0', message: 'Aceptado' },
          },
          files: { pdf: 'https://s3/inv.pdf', xml: 'https://s3/inv.xml', zip: 'https://s3/inv.zip' },
        }),
      });

      const resultado = await service.crearFactura({
        token: 'reseller-token', baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1', companyId: 'company-1',
        number: 6, resolution: RESOLUCION, regimeCode: 'O-48', invoicePeriod: { startDate: '2026-09-01', endDate: '2026-09-01' }, customer: CUSTOMER, items: [ITEM], payments: PAGOS, totalAmounts: TOTALES,
      });

      expect(resultado).toEqual(expect.objectContaining({
        alegraDocumentId: 'inv-1', cufe: 'cufe-abc', fullNumber: 'DE6',
        legalStatus: 'ACCEPTED', isFinal: true,
        urlPdf: 'https://s3/inv.pdf', urlXml: 'https://s3/inv.xml', urlZip: 'https://s3/inv.zip',
      }));
      const [url, opciones] = fetchMock.mock.calls[0];
      expect(url).toBe('https://sandbox-api.alegra.com/e-provider/col/v1/invoices');
      const body = JSON.parse(opciones.body);
      expect(body.documentType).toBe('01');
      expect(body.number).toBe(6);
      expect(body.customer).toEqual(CUSTOMER);
      expect(body.items[0].code).toBe('999');
      expect(body.totalAmounts.total).toBeUndefined();
      expect(body.totalAmounts.currencyCode).toBeUndefined();
    });

    it('cuando la DIAN no responde al instante, guarda isFinal false y el trackingReference', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ invoice: { id: 'inv-2', fullNumber: 'DE7', status: 'SENT', isFinal: false } }),
      });

      const resultado = await service.crearFactura({
        token: 't', baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1', companyId: 'company-1',
        number: 7, resolution: RESOLUCION, regimeCode: 'O-48', invoicePeriod: { startDate: '2026-09-01', endDate: '2026-09-01' }, customer: CUSTOMER, items: [ITEM], payments: PAGOS, totalAmounts: TOTALES,
      });

      expect(resultado.isFinal).toBe(false);
      expect(resultado.trackingReference).toEqual({ flow: 'co.invoice', environment: 'sandbox', documentId: 'inv-2' });
    });

    it('guarda errorMessages completo cuando legalStatus es REJECTED', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          invoice: {
            id: 'inv-3', fullNumber: 'DE8', status: 'SENT', legalStatus: 'REJECTED', isFinal: true,
            governmentResponse: { code: '99', message: 'Validación contiene errores', errorMessages: ['Regla: X', 'Regla: Y'] },
          },
        }),
      });

      const resultado = await service.crearFactura({
        token: 't', baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1', companyId: 'company-1',
        number: 8, resolution: RESOLUCION, regimeCode: 'O-48', invoicePeriod: { startDate: '2026-09-01', endDate: '2026-09-01' }, customer: CUSTOMER, items: [ITEM], payments: PAGOS, totalAmounts: TOTALES,
      });

      expect(resultado.legalStatus).toBe('REJECTED');
      expect(resultado.errorMessages).toEqual(['Regla: X', 'Regla: Y']);
    });
  });

  describe('consultarFactura', () => {
    it('llama a GET /invoices/{documentId} y devuelve el mismo shape que crearFactura', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          invoice: { id: 'inv-2', cufe: 'cufe-2', fullNumber: 'DE7', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true },
          files: { pdf: 'https://s3/2.pdf', xml: 'https://s3/2.xml' },
        }),
      });

      const resultado = await service.consultarFactura({
        token: 't', baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1', documentId: 'inv-2',
      });

      expect(resultado).toEqual(expect.objectContaining({ alegraDocumentId: 'inv-2', legalStatus: 'ACCEPTED', isFinal: true }));
      expect(fetchMock.mock.calls[0][0]).toBe('https://sandbox-api.alegra.com/e-provider/col/v1/invoices/inv-2');
    });
  });

  describe('crearNotaCredito / crearNotaDebito', () => {
    const DOC_ASOCIADO = { prefix: 'DE', number: 6, documentType: '01', date: '2026-09-01', uuid: 'cufe-abc' };
    const CUSTOMER = { identificationNumber: '222222222222', identificationType: '43', name: 'Consumidor Final' };
    const ITEM = {
      description: 'Free Miau', quantity: 1, price: 45000, unitCode: '94', code: '999',
      subtotal: 45000, total: 53550, taxAmount: 8550,
      taxes: [{ taxCode: '01', taxAmount: 8550, taxPercentage: '19.00', taxableAmount: 45000 }],
    };
    const TOTALES = {
      grossTotal: 45000, taxableTotal: 45000, taxTotal: 8550, payableTotal: 53550,
      discountTotal: 0, chargeTotal: 0, advanceTotal: 0,
    };
    const PAGOS = [{ paymentForm: '1', paymentMethod: '10', paymentDueDate: '2026-09-01' }];

    it('crearNotaCredito llama a POST /credit-notes con associatedDocuments (shape confirmado con validate_co_payload)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ invoices: [{ id: 'cn-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true }] }),
      });

      const resultado = await service.crearNotaCredito({
        token: 't', baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1', companyId: 'company-1',
        number: 100, conceptCode: '2', documentoAsociado: DOC_ASOCIADO, regimeCode: 'O-48', invoicePeriod: { startDate: '2026-09-01', endDate: '2026-09-01' }, customer: CUSTOMER, items: [ITEM], payments: PAGOS, totalAmounts: TOTALES,
      });

      expect(resultado).toEqual({ alegraDocumentId: 'cn-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true });
      const [url, opciones] = fetchMock.mock.calls[0];
      expect(url).toBe('https://sandbox-api.alegra.com/e-provider/col/v1/credit-notes');
      const body = JSON.parse(opciones.body);
      expect(body.associatedDocuments).toEqual([DOC_ASOCIADO]);
      expect(body.conceptCode).toBe('2');
    });

    it('crearNotaDebito llama a POST /debit-notes con associatedDocuments (shape confirmado con validate_co_payload)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ debitNote: { id: 'dn-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true } }),
      });

      const resultado = await service.crearNotaDebito({
        token: 't', baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1', companyId: 'company-1',
        number: 200, conceptCode: '4', documentoAsociado: DOC_ASOCIADO, regimeCode: 'O-48', invoicePeriod: { startDate: '2026-09-01', endDate: '2026-09-01' }, customer: CUSTOMER, items: [ITEM], payments: PAGOS, totalAmounts: TOTALES,
      });

      expect(resultado).toEqual({ alegraDocumentId: 'dn-1', status: 'SENT', legalStatus: 'ACCEPTED', isFinal: true });
      const [url, opciones] = fetchMock.mock.calls[0];
      expect(url).toBe('https://sandbox-api.alegra.com/e-provider/col/v1/debit-notes');
      const body = JSON.parse(opciones.body);
      expect(body.associatedDocuments).toEqual([DOC_ASOCIADO]);
      expect(body.conceptCode).toBe('4');
    });
  });
});
