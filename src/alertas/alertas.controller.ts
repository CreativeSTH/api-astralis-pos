import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AlertasService } from './alertas.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { TipoAlerta, SeveridadAlerta } from '../common/enums/alerta.enum';

@ApiTags('Alertas')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('alertas')
export class AlertasController {
  constructor(private readonly alertasService: AlertasService) {}

  @Get()
  @RequierePermiso(ModuloPermiso.ALERTAS, AccionPermiso.VER)
  findAll(
    @Query('tipo') tipo?: TipoAlerta,
    @Query('severidad') severidad?: SeveridadAlerta,
    @Query('resuelta') resuelta?: string,
  ) {
    return this.alertasService.findAll({
      tipo,
      severidad,
      resuelta: resuelta !== undefined ? resuelta === 'true' : undefined,
    });
  }

  @Get('resumen')
  @RequierePermiso(ModuloPermiso.ALERTAS, AccionPermiso.VER)
  resumen() {
    return this.alertasService.resumen();
  }

  @Post('generar')
  @RequierePermiso(ModuloPermiso.ALERTAS, AccionPermiso.CREAR)
  generar() {
    return this.alertasService.generar();
  }

  @Patch(':id/resolver')
  @RequierePermiso(ModuloPermiso.ALERTAS, AccionPermiso.EDITAR)
  resolver(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertasService.resolver(id);
  }

  @Patch(':id/leida')
  @RequierePermiso(ModuloPermiso.ALERTAS, AccionPermiso.EDITAR)
  marcarLeida(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertasService.marcarLeida(id);
  }
}
