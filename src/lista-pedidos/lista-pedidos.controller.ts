import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListaPedidosService } from './lista-pedidos.service';
import { CreateItemPedidoDto } from './dto/create-item-pedido.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

/** Gateado con el permiso de INVENTARIO — es, en esencia, "qué reponer". */
@ApiTags('Lista de pedidos')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('lista-pedidos')
export class ListaPedidosController {
  constructor(private readonly listaPedidosService: ListaPedidosService) {}

  @Get()
  @RequierePermiso(ModuloPermiso.INVENTARIO, AccionPermiso.VER)
  findAll(@Query('comprado') comprado?: string) {
    return this.listaPedidosService.findAll(
      comprado !== undefined ? comprado === 'true' : undefined,
    );
  }

  @Post()
  @RequierePermiso(ModuloPermiso.INVENTARIO, AccionPermiso.CREAR)
  agregar(@Body() dto: CreateItemPedidoDto) {
    return this.listaPedidosService.agregar(dto);
  }

  @Patch(':id/comprado')
  @RequierePermiso(ModuloPermiso.INVENTARIO, AccionPermiso.EDITAR)
  marcarComprado(@Param('id', ParseUUIDPipe) id: string) {
    return this.listaPedidosService.marcarComprado(id);
  }

  @Delete(':id')
  @RequierePermiso(ModuloPermiso.INVENTARIO, AccionPermiso.ELIMINAR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.listaPedidosService.remove(id);
  }
}
