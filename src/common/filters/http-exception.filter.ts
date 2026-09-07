import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException ? exception.getResponse() : null;
    const message =
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
        ? (exceptionResponse as { message: string | string[] }).message
        : isHttpException
          ? exception.message
          : 'Internal server error';

    // Algunos guards (ej. SuscripcionGuard) agregan un `code` al body de la excepción para que el
    // frontend distinga variantes del mismo status HTTP (ej. 402 SOLO_LECTURA vs. 402 BLOQUEADO)
    // sin tener que parsear el `message`. Bug real encontrado en vivo: sin este spread, este
    // filtro reconstruía el payload desde cero y lo perdía siempre, aunque el guard sí lo mandara.
    const code =
      exceptionResponse && typeof exceptionResponse === 'object' && 'code' in exceptionResponse
        ? (exceptionResponse as { code: string }).code
        : undefined;

    const errorPayload = {
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error: isHttpException ? exception.name : 'InternalServerError',
      ...(code !== undefined ? { code } : {}),
    };

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${statusCode}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} - ${statusCode}`);
    }

    response.status(statusCode).json(errorPayload);
  }
}
