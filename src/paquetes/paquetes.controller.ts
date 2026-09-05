import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaquetesService } from './paquetes.service';
import { CreatePaqueteDto } from './dto/create-paquete.dto';
import { UpdatePaqueteDto } from './dto/update-paquete.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

@ApiTags('Paquetes')
@ApiBearerAuth('JWT-auth')
@Controller('paquetes')
export class PaquetesController {
  constructor(private readonly paquetesService: PaquetesService) {}

  /**
   * Alcanzable por cualquier usuario autenticado de un negocio (no solo tier SISTEMA, que es
   * quien administra el catálogo vía los demás endpoints) — el selector de plan de "pagar/
   * reactivar" (ver SelectorPlanPago) necesita listar los planes disponibles, y un Administrador
   * de negocio normal no tiene el permiso PAQUETES:VER (ese catálogo es de gestión de precios,
   * no de consulta por el cliente). Va antes de `:id` para no chocar con esa ruta dinámica.
   */
  @UseGuards(JwtAuthGuard)
  @Get('disponibles')
  @ApiOperation({ summary: 'Paquetes activos, para elegir uno al pagar/reactivar — sin requerir PAQUETES:VER' })
  disponibles() {
    return this.paquetesService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequierePermiso(ModuloPermiso.PAQUETES, AccionPermiso.CREAR)
  @ApiOperation({ summary: 'Crear un paquete nuevo (requiere PAQUETES:CREAR)' })
  create(@Body() dto: CreatePaqueteDto) {
    return this.paquetesService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequierePermiso(ModuloPermiso.PAQUETES, AccionPermiso.VER)
  findAll() {
    return this.paquetesService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequierePermiso(ModuloPermiso.PAQUETES, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.paquetesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequierePermiso(ModuloPermiso.PAQUETES, AccionPermiso.EDITAR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePaqueteDto) {
    return this.paquetesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequierePermiso(ModuloPermiso.PAQUETES, AccionPermiso.ELIMINAR)
  @ApiOperation({ summary: 'Desactivar un paquete (soft delete — el FREE no se puede desactivar)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.paquetesService.remove(id);
  }
}
