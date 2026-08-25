import { WompiClientService } from './wompi-client.service';

describe('WompiClientService', () => {
  let service: WompiClientService;

  beforeEach(() => {
    service = new WompiClientService();
    global.fetch = jest.fn();
  });

  it('obtiene los tokens de aceptación del merchant', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          presigned_acceptance: { acceptance_token: 'tok-a' },
          presigned_personal_data_auth: { acceptance_token: 'tok-b' },
        },
      }),
    });

    const resultado = await service.obtenerTokensAceptacion('pub_test_123');

    expect(resultado).toEqual({ acceptanceToken: 'tok-a', acceptPersonalAuth: 'tok-b' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/merchants/pub_test_123'),
      expect.anything(),
    );
  });

  it('crea una transacción y devuelve id + status', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id: 'txn-123', status: 'PENDING' } }),
    });

    const resultado = await service.crearTransaccion({
      llavePrivada: 'prv_test_123',
      amountInCents: 1500000,
      reference: 'ref-abc',
      acceptanceToken: 'tok-a',
      acceptPersonalAuth: 'tok-b',
      paymentMethod: { type: 'NEQUI', phone_number: '3001234567' },
      customerEmail: 'cliente@negocio.local',
    });

    expect(resultado).toEqual({ wompiTransactionId: 'txn-123', status: 'PENDING' });
    // Verify Authorization header is included
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/transactions'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer prv_test_123',
        }),
      }),
    );
  });

  it('obtenerTokensAceptacion lanza error cuando Wompi retorna ok: false', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    await expect(service.obtenerTokensAceptacion('pub_test_123')).rejects.toThrow(
      'No se pudo obtener el merchant de Wompi',
    );
  });

  it('crearTransaccion lanza error cuando Wompi retorna ok: false', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    await expect(
      service.crearTransaccion({
        llavePrivada: 'prv_test_123',
        amountInCents: 1500000,
        reference: 'ref-abc',
        acceptanceToken: 'tok-a',
        acceptPersonalAuth: 'tok-b',
        paymentMethod: { type: 'NEQUI', phone_number: '3001234567' },
        customerEmail: 'cliente@negocio.local',
      }),
    ).rejects.toThrow('Wompi rechazó la creación de la transacción');
  });
});
