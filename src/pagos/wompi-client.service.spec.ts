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

    expect(resultado).toEqual({
      acceptanceToken: 'tok-a',
      acceptPersonalAuth: 'tok-b',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/merchants/pub_test_123'),
      expect.anything(),
    );
  });

  it('crea una transacción y devuelve id + status (NEQUI no trae `extra`)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'txn-123',
          status: 'PENDING',
          payment_method: { type: 'NEQUI' },
        },
      }),
    });

    const resultado = await service.crearTransaccion({
      llavePrivada: 'prv_test_123',
      amountInCents: 1500000,
      currency: 'COP',
      reference: 'ref-abc',
      signature: 'sig-test',
      acceptanceToken: 'tok-a',
      acceptPersonalAuth: 'tok-b',
      paymentMethod: { type: 'NEQUI', phone_number: '3001234567' },
      customerEmail: 'cliente@negocio.local',
    });

    expect(resultado).toEqual({
      wompiTransactionId: 'txn-123',
      status: 'PENDING',
      extra: undefined,
    });
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

  it('incluye `signature` en el body — Wompi rechaza el POST /transactions sin este campo (ver error real "Firma de integridad requerida no enviada")', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'txn-1',
          status: 'PENDING',
          payment_method: { type: 'NEQUI' },
        },
      }),
    });

    await service.crearTransaccion({
      llavePrivada: 'prv_test_123',
      amountInCents: 1500000,
      currency: 'COP',
      reference: 'ref-abc',
      signature: 'sig-calculada-en-pagos-service',
      acceptanceToken: 'tok-a',
      acceptPersonalAuth: 'tok-b',
      paymentMethod: { type: 'NEQUI', phone_number: '3001234567' },
      customerEmail: 'cliente@negocio.local',
    });

    const [, opciones] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(opciones.body as string);
    expect(body.signature).toBe('sig-calculada-en-pagos-service');
    expect(body.currency).toBe('COP');
  });

  it('devuelve `extra.qr_image` tal cual cuando Wompi lo trae (BANCOLOMBIA_QR)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'txn-qr-1',
          status: 'PENDING',
          payment_method: {
            type: 'BANCOLOMBIA_QR',
            extra: {
              qr_image: 'data:image/png;base64,AAAA',
              async_payment_url: null,
            },
          },
        },
      }),
    });

    const resultado = await service.crearTransaccion({
      llavePrivada: 'prv_test_123',
      amountInCents: 1500000,
      currency: 'COP',
      reference: 'ref-qr',
      signature: 'sig-test',
      acceptanceToken: 'tok-a',
      acceptPersonalAuth: 'tok-b',
      paymentMethod: {
        type: 'BANCOLOMBIA_QR',
        payment_description: 'Venta POS',
      },
      customerEmail: 'cliente@negocio.local',
    });

    expect(resultado).toEqual({
      wompiTransactionId: 'txn-qr-1',
      status: 'PENDING',
      extra: {
        qr_image: 'data:image/png;base64,AAAA',
        async_payment_url: null,
      },
    });
  });

  it('devuelve `extra.async_payment_url` tal cual cuando Wompi lo trae (PSE)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'txn-pse-1',
          status: 'PENDING',
          payment_method: {
            type: 'PSE',
            extra: { async_payment_url: 'https://checkout.wompi.co/pse/abc' },
          },
        },
      }),
    });

    const resultado = await service.crearTransaccion({
      llavePrivada: 'prv_test_123',
      amountInCents: 1500000,
      currency: 'COP',
      reference: 'ref-pse',
      signature: 'sig-test',
      acceptanceToken: 'tok-a',
      acceptPersonalAuth: 'tok-b',
      paymentMethod: { type: 'PSE', payment_description: 'Venta POS' },
      customerEmail: 'cliente@negocio.local',
    });

    expect(resultado).toEqual({
      wompiTransactionId: 'txn-pse-1',
      status: 'PENDING',
      extra: { async_payment_url: 'https://checkout.wompi.co/pse/abc' },
    });
  });

  it('obtenerTransaccion consulta GET /transactions/{id} con la llave pública y devuelve status + extra', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'txn-qr-1',
          status: 'PENDING',
          payment_method: {
            type: 'BANCOLOMBIA_QR',
            extra: {
              qr_id: 'q1',
              qr_image: 'PHN2Zz4=',
              external_identifier: 'ext-1',
            },
          },
        },
      }),
    });

    const resultado = await service.obtenerTransaccion(
      'txn-qr-1',
      'pub_test_123',
    );

    expect(resultado).toEqual({
      status: 'PENDING',
      extra: {
        qr_id: 'q1',
        qr_image: 'PHN2Zz4=',
        external_identifier: 'ext-1',
      },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/transactions/txn-qr-1'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer pub_test_123',
        }),
      }),
    );
  });

  it('obtenerTransaccion lanza error cuando Wompi retorna ok: false', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    await expect(
      service.obtenerTransaccion('txn-1', 'pub_test_123'),
    ).rejects.toThrow(
      'No se pudo consultar el estado de la transacción en Wompi',
    );
  });

  it('obtenerTokensAceptacion lanza error cuando Wompi retorna ok: false', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    await expect(
      service.obtenerTokensAceptacion('pub_test_123'),
    ).rejects.toThrow('No se pudo obtener el merchant de Wompi');
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
        currency: 'COP',
        reference: 'ref-abc',
        signature: 'sig-test',
        acceptanceToken: 'tok-a',
        acceptPersonalAuth: 'tok-b',
        paymentMethod: { type: 'NEQUI', phone_number: '3001234567' },
        customerEmail: 'cliente@negocio.local',
      }),
    ).rejects.toThrow('Wompi rechazó la creación de la transacción');
  });
});
