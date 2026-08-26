import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtClientePayload {
  sub: string;
  negocioId: string;
}

@Injectable()
export class JwtClienteStrategy extends PassportStrategy(Strategy, 'jwt-cliente') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        'JWT_CLIENTE_SECRET',
        'dev-secret-cliente-cambiar-en-produccion',
      ),
    });
  }

  validate(payload: JwtClientePayload): JwtClientePayload {
    return payload;
  }
}
