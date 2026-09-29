import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/decorators/current-user.decorator';
import { ComprobantesListadoService } from './comprobantes-listado.service';
import { FiltrosComprobantesDto } from './dto/filtros-comprobantes.dto';
import { FormatoImpresionService } from './formato-impresion.service';
import { ActualizarFormatoDto } from './dto/actualizar-formato.dto';

@ApiTags('Facturacion')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('facturacion')
export class FacturacionController {
  constructor(
    private readonly listado: ComprobantesListadoService,
    private readonly formato: FormatoImpresionService,
  ) {}

  @Get('comprobantes')
  @RequierePermiso(ModuloPermiso.FACTURACION, AccionPermiso.VER)
  @ApiOperation({
    summary:
      'Facturas electrónicas, recibos, facturas históricas y recibos de caja del negocio, paginados',
  })
  listar(
    @CurrentUser() usuario: JwtUserPayload,
    @Query() filtros: FiltrosComprobantesDto,
  ) {
    return this.listado.listar(this.negocioId(usuario), filtros);
  }

  @Get('formato')
  @RequierePermiso(ModuloPermiso.FACTURACION, AccionPermiso.VER)
  @ApiOperation({
    summary:
      'Formato de impresión del negocio: logo, mensaje de cierre y términos',
  })
  obtenerFormato(@CurrentUser() usuario: JwtUserPayload) {
    return this.formato.obtener(this.negocioId(usuario));
  }

  @Patch('formato')
  @RequierePermiso(ModuloPermiso.FACTURACION, AccionPermiso.EDITAR)
  @ApiOperation({
    summary:
      'Cambiar el mensaje de cierre y los términos (el logo se cambia en Datos del negocio)',
  })
  actualizarFormato(
    @CurrentUser() usuario: JwtUserPayload,
    @Body() dto: ActualizarFormatoDto,
  ) {
    return this.formato.actualizar(this.negocioId(usuario), dto);
  }

  private negocioId(usuario: JwtUserPayload): string {
    if (!usuario.negocioId)
      throw new BadRequestException('Tu usuario no pertenece a un negocio');
    return usuario.negocioId;
  }
}
