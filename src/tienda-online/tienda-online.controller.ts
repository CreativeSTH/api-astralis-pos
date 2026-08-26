import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { TiendaOnlineService } from './tienda-online.service';
import { ElegirBodegaDto } from './dto/elegir-bodega.dto';

@ApiTags('Tienda online')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tienda-online')
export class TiendaOnlineController {
  constructor(private readonly tiendaOnlineService: TiendaOnlineService) {}

  @Get('configuracion')
  @RequierePermiso(ModuloPermiso.TIENDA_ONLINE, AccionPermiso.VER)
  obtenerConfiguracion() {
    return this.tiendaOnlineService.obtenerConfiguracion();
  }

  @Patch('bodega')
  @RequierePermiso(ModuloPermiso.TIENDA_ONLINE, AccionPermiso.EDITAR)
  elegirBodega(@Body() dto: ElegirBodegaDto) {
    return this.tiendaOnlineService.elegirBodega(dto.bodegaId);
  }

  @Patch('activar')
  @RequierePermiso(ModuloPermiso.TIENDA_ONLINE, AccionPermiso.EDITAR)
  activar() {
    return this.tiendaOnlineService.activar();
  }

  @Patch('desactivar')
  @RequierePermiso(ModuloPermiso.TIENDA_ONLINE, AccionPermiso.EDITAR)
  desactivar() {
    return this.tiendaOnlineService.desactivar();
  }
}
