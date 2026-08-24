import {
  BadRequestException,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../common/decorators/current-user.decorator';

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

  @Get('mi-negocio')
  @RequierePermiso(ModuloPermiso.NEGOCIO, AccionPermiso.VER)
  @ApiOperation({
    summary: 'Datos del negocio del usuario autenticado (para Administradores — distinto del catálogo de plataforma NEGOCIOS)',
  })
  miNegocio(@CurrentUser() usuario: JwtUserPayload) {
    return this.negociosService.findOne(this.exigirNegocioId(usuario));
  }

  @Patch('mi-negocio')
  @RequierePermiso(ModuloPermiso.NEGOCIO, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Editar los datos del propio negocio (nombre, NIT, contacto)' })
  actualizarMiNegocio(@CurrentUser() usuario: JwtUserPayload, @Body() dto: UpdateNegocioDto) {
    return this.negociosService.update(this.exigirNegocioId(usuario), dto);
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

  /** Un usuario de tier SISTEMA no pertenece a ningún negocio — `/mi-negocio` no aplica para esa cuenta. */
  private exigirNegocioId(usuario: JwtUserPayload): string {
    if (!usuario.negocioId) {
      throw new BadRequestException('Tu usuario no pertenece a un negocio');
    }
    return usuario.negocioId;
  }
}
