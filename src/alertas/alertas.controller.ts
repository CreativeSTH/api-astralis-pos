import {
  Body,
  Controller,
  Delete,
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
import { CreateAlertaDto } from './dto/create-alerta.dto';
import { ToggleActivaDto } from './dto/toggle-activa.dto';
import { CreateReglaAlertaDto } from './dto/create-regla-alerta.dto';
import { UpdateReglaAlertaDto } from './dto/update-regla-alerta.dto';

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
    @Query('activa') activa?: string,
  ) {
    return this.alertasService.findAll({
      tipo,
      severidad,
      resuelta: resuelta !== undefined ? resuelta === 'true' : undefined,
      activa: activa !== undefined ? activa === 'true' : undefined,
    });
  }

  @Post()
  @RequierePermiso(ModuloPermiso.ALERTAS, AccionPermiso.CREAR)
  crear(@Body() dto: CreateAlertaDto) {
    return this.alertasService.crear(dto);
  }

  @Get('resumen')
  @RequierePermiso(ModuloPermiso.ALERTAS, AccionPermiso.VER)
  resumen() {
    return this.alertasService.resumen();
  }

  @Get('reglas')
  @RequierePermiso(ModuloPermiso.ALERTAS, AccionPermiso.VER)
  findReglas() {
    return this.alertasService.findReglas();
  }

  @Post('reglas')
  @RequierePermiso(ModuloPermiso.ALERTAS, AccionPermiso.CREAR)
  crearRegla(@Body() dto: CreateReglaAlertaDto) {
    return this.alertasService.crearRegla(dto);
  }

  @Patch('reglas/:id')
  @RequierePermiso(ModuloPermiso.ALERTAS, AccionPermiso.EDITAR)
  actualizarRegla(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReglaAlertaDto) {
    return this.alertasService.actualizarRegla(id, dto);
  }

  @Delete('reglas/:id')
  @RequierePermiso(ModuloPermiso.ALERTAS, AccionPermiso.ELIMINAR)
  eliminarRegla(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertasService.eliminarRegla(id);
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
  @RequierePermiso(ModuloPermiso.ALERTAS, AccionPermiso.VER)
  marcarLeida(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertasService.marcarLeida(id);
  }

  @Patch(':id/activa')
  @RequierePermiso(ModuloPermiso.ALERTAS, AccionPermiso.EDITAR)
  alternarActiva(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ToggleActivaDto) {
    return this.alertasService.alternarActiva(id, dto.activa);
  }
}
