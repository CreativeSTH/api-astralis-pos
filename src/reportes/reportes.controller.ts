import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportesService } from './reportes.service';
import { ReportesQueryDto } from './dto/reportes-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuario } from '../common/enums/rol-usuario.enum';

@ApiTags('Reportes')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.ADMIN_NEGOCIO)
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
