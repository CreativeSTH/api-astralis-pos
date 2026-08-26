import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtClientePayload } from '../strategies/jwt-cliente.strategy';

export const ClienteActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtClientePayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
