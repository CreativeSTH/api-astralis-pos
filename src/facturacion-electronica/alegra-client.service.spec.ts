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

  it('consultarCompania lee governmentStatus.pos (shape real confirmado en vivo — GET /companies/{id})', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ company: { id: 'company-1', governmentStatus: { pos: 'AUTHORIZED' } } }),
    });

    const resultado = await service.consultarCompania({
      token: 'reseller-token',
      baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
      companyId: 'company-1',
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
        { description: 'Producto', quantity: 1, price: 10000, unitCode: '94', subtotal: 10000, total: 10000 },
      ],
      totalAmounts: { total: 10000, grossTotal: 10000, taxableTotal: 10000, taxTotal: 0, payableTotal: 10000 },
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
});
