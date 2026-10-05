import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { AuditoriaService } from './auditoria.service';
import {
  FiltrosAuditoriaDto,
  PaginacionAuditoriaDto,
} from './dto/filtros-auditoria.dto';

/** Solo lectura: la tabla la escriben el subscriber y `registrarAccion`, nunca un endpoint. */
@ApiTags('Auditoría')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  @RequierePermiso(ModuloPermiso.AUDITORIA, AccionPermiso.VER)
  @ApiOperation({
    summary: 'Historial de cambios del negocio, paginado y filtrable',
  })
  consultar(@Query() filtros: FiltrosAuditoriaDto) {
    return this.auditoria.consultar(filtros);
  }

  @Get('usuarios')
  @RequierePermiso(ModuloPermiso.AUDITORIA, AccionPermiso.VER)
  @ApiOperation({
    summary: 'Usuarios que aparecen en la auditoría (para el filtro)',
  })
  usuarios() {
    return this.auditoria.usuarios();
  }

  @Get('entidad/:entidad/:entidadId')
  @RequierePermiso(ModuloPermiso.AUDITORIA, AccionPermiso.VER)
  @ApiOperation({ summary: 'Historial completo de un registro puntual' })
  historial(
    @Param('entidad') entidad: string,
    @Param('entidadId', ParseUUIDPipe) entidadId: string,
    @Query() paginacion: PaginacionAuditoriaDto,
  ) {
    return this.auditoria.historial(entidad, entidadId, paginacion);
  }
}
