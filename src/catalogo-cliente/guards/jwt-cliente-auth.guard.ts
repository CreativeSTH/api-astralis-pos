import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtClienteAuthGuard extends AuthGuard('jwt-cliente') {}
