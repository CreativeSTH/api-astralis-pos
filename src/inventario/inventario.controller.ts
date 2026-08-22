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
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuario } from '../common/enums/rol-usuario.enum';

@ApiTags('Inventario')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get()
  findAll(@Query('bodegaId') bodegaId?: string) {
    return this.inventarioService.findAll(bodegaId);
  }

  @Get('bajo-stock')
  @ApiOperation({ summary: 'Productos en o por debajo del stock mínimo' })
  bajoStock() {
    return this.inventarioService.bajoStock();
  }

  @Get('kardex')
  @ApiOperation({
    summary:
      'Historial de movimientos de inventario (kardex), filtrable por producto/bodega/fecha',
  })
  kardex(@Query() query: KardexQueryDto) {
    return this.inventarioService.kardex(query);
  }

  @Post('ajustar')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  @ApiOperation({
    summary: 'Ajuste manual de stock (entrada, salida, conteo físico)',
  })
  ajustar(@Body() dto: AjustarStockDto) {
    return this.inventarioService.ajustarStock(dto);
  }

  @Patch('stock-minimo')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  setStockMinimo(@Body() dto: SetStockMinimoDto) {
    return this.inventarioService.setStockMinimo(dto);
  }
}
