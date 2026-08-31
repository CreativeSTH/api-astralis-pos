import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { PinLoginDto } from './dto/pin-login.dto';
import { ReenviarVerificacionDto } from './dto/reenviar-verificacion.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login de usuario (cajero o admin de negocio)' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('pin-switch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cambio rápido de cajero por PIN, sin cerrar la sesión del negocio actual',
  })
  pinSwitch(
    @CurrentUser() usuarioActual: JwtUserPayload,
    @Body() dto: PinLoginDto,
  ) {
    return this.authService.loginConPin(usuarioActual.negocioId, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequierePermiso(ModuloPermiso.NEGOCIOS, AccionPermiso.EDITAR)
  @ApiBearerAuth('JWT-auth')
  @Post('entrar-negocio/:negocioId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Emite una sesión como el Administrador de un negocio (solo tier SISTEMA) — soporte/configuración sin necesitar sus credenciales',
  })
  entrarComoNegocio(@Param('negocioId', ParseUUIDPipe) negocioId: string) {
    return this.authService.entrarComoNegocio(negocioId);
  }

  @Public()
  @Get('verificar-email')
  @ApiOperation({ summary: 'Confirma el correo de una cuenta recién registrada e inicia sesión' })
  verificarEmail(@Query('token') token: string) {
    return this.authService.verificarEmail(token);
  }

  @Public()
  @Post('reenviar-verificacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reenvía el correo de confirmación de cuenta' })
  async reenviarVerificacion(@Body() dto: ReenviarVerificacionDto) {
    await this.authService.reenviarVerificacion(dto.email);
    return { mensaje: 'Si el correo existe y no está verificado, te reenviamos el link.' };
  }
}
