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
  });
});
