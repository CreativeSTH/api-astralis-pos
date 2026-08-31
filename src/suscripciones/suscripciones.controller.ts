import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuscripcionesService } from './suscripciones.service';
import { ReactivarSuscripcionDto } from './dto/reactivar-suscripcion.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Suscripción')
@Controller('suscripcion')
export class SuscripcionesController {
  constructor(private readonly suscripcionesService: SuscripcionesService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('mi-estado')
  @ApiOperation({ summary: 'Estado de la suscripción del negocio autenticado — alcanzable aunque esté VENCIDA' })
  miEstado(@CurrentUser() usuario: JwtUserPayload) {
    return this.suscripcionesService.miEstado(usuario.negocioId!);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('reactivar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactiva (o cambia de plan) con un cobro único — alcanzable aunque esté VENCIDA' })
  reactivar(@CurrentUser() usuario: JwtUserPayload, @Body() dto: ReactivarSuscripcionDto) {
    return this.suscripcionesService.iniciarReactivacion(usuario.negocioId!, dto);
  }

  @Public()
  @Post('webhook-wompi')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook de Wompi para confirmaciones de reactivación — endpoint público, verificado por firma' })
  async webhook(@Body() payload: any) {
    await this.suscripcionesService.procesarWebhookWompi(payload);
    return { received: true };
  }
}
