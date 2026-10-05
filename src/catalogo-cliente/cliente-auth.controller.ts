import { Body, Controller, Param, ParseUUIDPipe, Post, UseInterceptors } from '@nestjs/common';
import { OrigenAuditoriaInterceptor } from '../auditoria/origen-auditoria.interceptor';
import { OrigenAuditoria } from '../auditoria/enums/origen-auditoria.enum';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ClienteAuthService } from './cliente-auth.service';
import { RegistroClienteDto } from './dto/registro-cliente.dto';
import { LoginClienteDto } from './dto/login-cliente.dto';

@ApiTags('Autenticación de clientes')
@UseInterceptors(new OrigenAuditoriaInterceptor(OrigenAuditoria.TIENDA_ONLINE))
@Controller('catalogo-cliente/:negocioId/auth')
export class ClienteAuthController {
  constructor(private readonly clienteAuthService: ClienteAuthService) {}

  @Post('registro')
  @Public()
  registrar(
    @Param('negocioId', ParseUUIDPipe) negocioId: string,
    @Body() dto: RegistroClienteDto,
  ) {
    return this.clienteAuthService.registrar(negocioId, dto);
  }

  @Post('login')
  @Public()
  login(
    @Param('negocioId', ParseUUIDPipe) negocioId: string,
    @Body() dto: LoginClienteDto,
  ) {
    return this.clienteAuthService.login(negocioId, dto);
  }
}
