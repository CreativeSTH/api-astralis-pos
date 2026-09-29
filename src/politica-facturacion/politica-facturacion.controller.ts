import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PoliticaFacturacionService } from './politica-facturacion.service';
import { TopeUvtService } from './tope-uvt.service';
import { DeclararPerfilFiscalDto } from './dto/declarar-perfil-fiscal.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Política de facturación')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('politica-facturacion')
export class PoliticaFacturacionController {
  constructor(
    private readonly politica: PoliticaFacturacionService,
    private readonly topeUvt: TopeUvtService,
  ) {}

  /** Sin permiso específico a propósito: el POS de cualquier cajero necesita saber el modo para cobrar. */
  @Get('estado')
  @ApiOperation({ summary: 'Modo de facturación del negocio (electrónica, recibo, gracia, bloqueado, sin declarar) y su perfil fiscal' })
  estado(@CurrentUser() usuario: JwtUserPayload) {
    return this.politica.estado(this.negocioId(usuario));
  }

  @Patch('perfil-fiscal')
  @RequierePermiso(ModuloPermiso.NEGOCIO, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Declarar el perfil fiscal del negocio (tipo de persona y responsabilidad de IVA del RUT)' })
  declarar(@CurrentUser() usuario: JwtUserPayload, @Body() dto: DeclararPerfilFiscalDto) {
    return this.politica.declararPerfil(this.negocioId(usuario), usuario.sub, dto);
  }

  @Get('tope-uvt')
  @RequierePermiso(ModuloPermiso.FACTURACION_ELECTRONICA_DIAN, AccionPermiso.VER)
  @ApiOperation({ summary: 'Ventas registradas frente al tope de 3.500 UVT (solo aplica a no obligados)' })
  medicionTopeUvt(@CurrentUser() usuario: JwtUserPayload) {
    return this.topeUvt.medicionActual(this.negocioId(usuario));
  }

  private negocioId(usuario: JwtUserPayload): string {
    if (!usuario.negocioId) throw new BadRequestException('Tu usuario no pertenece a un negocio');
    return usuario.negocioId;
  }
}
