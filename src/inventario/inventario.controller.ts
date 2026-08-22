import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InventarioService } from './inventario.service';
import { AjustarStockDto } from './dto/ajustar-stock.dto';
import { SetStockMinimoDto } from './dto/set-stock-minimo.dto';
import { KardexQueryDto } from './dto/kardex-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

@ApiTags('Inventario')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get()
  @RequierePermiso(ModuloPermiso.INVENTARIO, AccionPermiso.VER)
  findAll(@Query('bodegaId') bodegaId?: string) {
    return this.inventarioService.findAll(bodegaId);
  }

  @Get('bajo-stock')
  @RequierePermiso(ModuloPermiso.INVENTARIO, AccionPermiso.VER)
  @ApiOperation({ summary: 'Productos en o por debajo del stock mínimo' })
  bajoStock() {
    return this.inventarioService.bajoStock();
  }

  @Get('kardex')
  @RequierePermiso(ModuloPermiso.INVENTARIO, AccionPermiso.VER)
  @ApiOperation({
    summary:
      'Historial de movimientos de inventario (kardex), filtrable por producto/bodega/fecha',
  })
  kardex(@Query() query: KardexQueryDto) {
    return this.inventarioService.kardex(query);
  }

  @Post('ajustar')
  @RequierePermiso(ModuloPermiso.INVENTARIO, AccionPermiso.CREAR)
  @ApiOperation({
    summary: 'Ajuste manual de stock (entrada, salida, conteo físico)',
  })
  ajustar(@Body() dto: AjustarStockDto) {
    return this.inventarioService.ajustarStock(dto);
  }

  @Patch('stock-minimo')
  @RequierePermiso(ModuloPermiso.INVENTARIO, AccionPermiso.EDITAR)
  setStockMinimo(@Body() dto: SetStockMinimoDto) {
    return this.inventarioService.setStockMinimo(dto);
  }
}
