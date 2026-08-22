import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CobrosService } from './cobros.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Cobros')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cobros')
export class CobrosController {
  constructor(private readonly cobrosService: CobrosService) {}

  @Get()
  findAll() {
    return this.cobrosService.findAll();
  }

  @Get('pendientes')
  pendientes() {
    return this.cobrosService.pendientes();
  }

  @Get('pagados')
  pagados() {
    return this.cobrosService.pagados();
  }

  @Get('proxima-quincena')
  proximaQuincena() {
    return this.cobrosService.proximaQuincena();
  }

  @Get('vencidos')
  vencidos() {
    return this.cobrosService.vencidos();
  }

  @Get('totales')
  totales() {
    return this.cobrosService.totales();
  }

  @Get('cliente/:clienteId')
  porCliente(@Param('clienteId', ParseUUIDPipe) clienteId: string) {
    return this.cobrosService.porCliente(clienteId);
  }
}
