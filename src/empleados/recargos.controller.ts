import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { RecargosService } from './recargos.service';
import { FiltrosRecargosDto } from './dto/filtros-recargos.dto';

/** Vive en el módulo de empleados aunque la ruta cuelgue de /reportes: depende del permiso EMPLEADOS, no de REPORTES. */
@ApiTags('Empleados')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reportes/recargos')
export class RecargosController {
  constructor(private readonly recargos: RecargosService) {}

  @Get()
  @RequierePermiso(ModuloPermiso.EMPLEADOS, AccionPermiso.VER)
  reporte(@Query() f: FiltrosRecargosDto) {
    return this.recargos.reporte(f);
  }
}
