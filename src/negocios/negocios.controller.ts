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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NegociosService } from './negocios.service';
import { CreateNegocioDto } from './dto/create-negocio.dto';
import { UpdateNegocioDto } from './dto/update-negocio.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

@ApiTags('Negocios')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('negocios')
export class NegociosController {
  constructor(private readonly negociosService: NegociosService) {}

  @Post()
  @RequierePermiso(ModuloPermiso.NEGOCIOS, AccionPermiso.CREAR)
  @ApiOperation({
    summary: 'Crear negocio + su admin inicial (requiere NEGOCIOS:CREAR)',
  })
  create(@Body() dto: CreateNegocioDto) {
    return this.negociosService.create(dto);
  }

  @Get()
  @RequierePermiso(ModuloPermiso.NEGOCIOS, AccionPermiso.VER)
  @ApiOperation({ summary: 'Listar negocios' })
  findAll() {
    return this.negociosService.findAll();
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.NEGOCIOS, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.negociosService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.NEGOCIOS, AccionPermiso.EDITAR)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNegocioDto,
  ) {
    return this.negociosService.update(id, dto);
  }

  @Delete(':id')
  @RequierePermiso(ModuloPermiso.NEGOCIOS, AccionPermiso.ELIMINAR)
  @ApiOperation({ summary: 'Desactivar negocio (soft delete)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.negociosService.remove(id);
  }
}
