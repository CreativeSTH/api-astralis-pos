import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/categorias', method: 'POST' }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('pasa el campo code al body de la respuesta cuando la excepción lo trae', () => {
    const exception = new HttpException(
      { message: 'Tu suscripción venció', code: 'SOLO_LECTURA' },
      HttpStatus.PAYMENT_REQUIRED,
    );

    filter.catch(exception, host);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SOLO_LECTURA' }));
  });

  it('no agrega code al body cuando la excepción no lo trae (comportamiento de siempre)', () => {
    const exception = new HttpException('Algo salió mal', HttpStatus.BAD_REQUEST);

    filter.catch(exception, host);

    const payload = json.mock.calls[0][0] as Record<string, unknown>;
    expect('code' in payload).toBe(false);
  });
});
