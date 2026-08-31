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
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('paquetes')
export class PaquetesController {
  constructor(private readonly paquetesService: PaquetesService) {}

  @Post()
  @RequierePermiso(ModuloPermiso.PAQUETES, AccionPermiso.CREAR)
  @ApiOperation({ summary: 'Crear un paquete nuevo (requiere PAQUETES:CREAR)' })
  create(@Body() dto: CreatePaqueteDto) {
    return this.paquetesService.create(dto);
  }

  @Get()
  @RequierePermiso(ModuloPermiso.PAQUETES, AccionPermiso.VER)
  findAll() {
    return this.paquetesService.findAll();
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.PAQUETES, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.paquetesService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.PAQUETES, AccionPermiso.EDITAR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePaqueteDto) {
    return this.paquetesService.update(id, dto);
  }

  @Delete(':id')
  @RequierePermiso(ModuloPermiso.PAQUETES, AccionPermiso.ELIMINAR)
  @ApiOperation({ summary: 'Desactivar un paquete (soft delete — el FREE no se puede desactivar)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.paquetesService.remove(id);
  }
}
