import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportesService } from './reportes.service';
import { ReportesQueryDto } from './dto/reportes-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

@ApiTags('Reportes')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequierePermiso(ModuloPermiso.REPORTES, AccionPermiso.VER)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('ventas')
  @ApiOperation({
    summary:
      'Totales de ventas por rango de fechas: ingresos, descuentos, por día, por método de pago',
  })
  ventas(@Query() query: ReportesQueryDto) {
    return this.reportesService.ventas(query);
  }

  @Get('margenes')
  @ApiOperation({
    summary: 'Margen bruto por rango de fechas y top productos por margen',
  })
  margenes(@Query() query: ReportesQueryDto) {
    return this.reportesService.margenes(query);
  }

  @Get('cierres-caja')
  @ApiOperation({
    summary: 'Historial de cierres de turno de caja con diferencia de arqueo',
  })
  cierresCaja(@Query() query: ReportesQueryDto) {
    return this.reportesService.cierresCaja(query);
  }
}
