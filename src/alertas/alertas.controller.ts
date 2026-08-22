import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AlertasService } from './alertas.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TipoAlerta, SeveridadAlerta } from '../common/enums/alerta.enum';

@ApiTags('Alertas')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alertas')
export class AlertasController {
  constructor(private readonly alertasService: AlertasService) {}

  @Get()
  findAll(
    @Query('tipo') tipo?: TipoAlerta,
    @Query('severidad') severidad?: SeveridadAlerta,
    @Query('resuelta') resuelta?: string,
  ) {
    return this.alertasService.findAll({
      tipo,
      severidad,
      resuelta: resuelta !== undefined ? resuelta === 'true' : undefined,
    });
  }

  @Get('resumen')
  resumen() {
    return this.alertasService.resumen();
  }

  @Post('generar')
  generar() {
    return this.alertasService.generar();
  }

  @Patch(':id/resolver')
  resolver(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertasService.resolver(id);
  }
}
