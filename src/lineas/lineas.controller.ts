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
import { LineasService } from './lineas.service';
import { CreateLineaDto } from './dto/create-linea.dto';
import { UpdateLineaDto } from './dto/update-linea.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

@ApiTags('Lineas')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('lineas')
export class LineasController {
  constructor(private readonly lineasService: LineasService) {}

  @Post()
  @RequierePermiso(ModuloPermiso.LINEAS, AccionPermiso.CREAR)
  create(@Body() dto: CreateLineaDto) {
    return this.lineasService.create(dto);
  }

  @Get()
  @RequierePermiso(ModuloPermiso.LINEAS, AccionPermiso.VER)
  findAll(@Query('marcaId') marcaId?: string) {
    return this.lineasService.findAll(marcaId);
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.LINEAS, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.lineasService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.LINEAS, AccionPermiso.EDITAR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLineaDto) {
    return this.lineasService.update(id, dto);
  }

  @Delete(':id')
  @RequierePermiso(ModuloPermiso.LINEAS, AccionPermiso.ELIMINAR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.lineasService.remove(id);
  }
}
