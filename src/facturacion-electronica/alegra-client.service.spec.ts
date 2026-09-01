import { AlegraClientService } from './alegra-client.service';

describe('AlegraClientService', () => {
  let service: AlegraClientService;
  const fetchMock = jest.fn();

  beforeEach(() => {
    service = new AlegraClientService();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  it('crearCompania devuelve el companyId', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'company-1' }) });

    const resultado = await service.crearCompania({
      token: 'reseller-token',
      baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
      nit: '900123456',
      razonSocial: 'Mascotas Pet Shop',
      direccion: 'Calle 1 # 2-3',
      ciudad: 'Bogotá',
      useAlegraCertificate: true,
    });

    expect(resultado).toEqual({ companyId: 'company-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/companies'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('crearDocumentoEquivalentePos devuelve cude/status/legalStatus', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'doc-1', cude: 'cude-abc', status: 'REGISTERED', legalStatus: 'ACCEPTED' }),
    });

    const resultado = await service.crearDocumentoEquivalentePos({
      token: 'reseller-token',
      baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
      companyId: 'company-1',
      number: 1,
      items: [{ description: 'Producto', quantity: 1, price: 10000 }],
      totalAmounts: { total: 10000 },
      payments: [{ type: 'CASH', amount: 10000 }],
    });

    expect(resultado).toEqual({
      alegraDocumentId: 'doc-1',
      cude: 'cude-abc',
      status: 'REGISTERED',
      legalStatus: 'ACCEPTED',
    });
  });

  it('lanza BadGatewayException si Alegra rechaza la creación de la compañía', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { reason: 'NIT inválido' } }),
    });

    await expect(
      service.crearCompania({
        token: 'reseller-token',
        baseUrl: 'https://sandbox-api.alegra.com/e-provider/col/v1',
        nit: '000',
        razonSocial: 'X',
        direccion: 'X',
        ciudad: 'X',
        useAlegraCertificate: true,
      }),
    ).rejects.toThrow('NIT inválido');
  });
});
