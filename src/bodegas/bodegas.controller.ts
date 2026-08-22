import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BodegasService } from './bodegas.service';
import { CreateBodegaDto } from './dto/create-bodega.dto';
import { UpdateBodegaDto } from './dto/update-bodega.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

@ApiTags('Bodegas')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('bodegas')
export class BodegasController {
  constructor(private readonly bodegasService: BodegasService) {}

  @Post()
  @RequierePermiso(ModuloPermiso.BODEGAS, AccionPermiso.CREAR)
  create(@Body() dto: CreateBodegaDto) {
    return this.bodegasService.create(dto);
  }

  @Get()
  @RequierePermiso(ModuloPermiso.BODEGAS, AccionPermiso.VER)
  findAll() {
    return this.bodegasService.findAll();
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.BODEGAS, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bodegasService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.BODEGAS, AccionPermiso.EDITAR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBodegaDto) {
    return this.bodegasService.update(id, dto);
  }

  @Delete(':id')
  @RequierePermiso(ModuloPermiso.BODEGAS, AccionPermiso.ELIMINAR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.bodegasService.remove(id);
  }
}
