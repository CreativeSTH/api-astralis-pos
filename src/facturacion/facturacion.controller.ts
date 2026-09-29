import {
  BadRequestException,
  Controller,
  Get,
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

@ApiTags('Facturacion')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('facturacion')
export class FacturacionController {
  constructor(private readonly listado: ComprobantesListadoService) {}

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
    if (!usuario.negocioId)
      throw new BadRequestException('Tu usuario no pertenece a un negocio');
    return this.listado.listar(usuario.negocioId, filtros);
  }
}
