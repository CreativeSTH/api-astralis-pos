import {
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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MetodosPagoService } from './metodos-pago.service';
import { CreateMetodoPagoDto } from './dto/create-metodo-pago.dto';
import { UpdateMetodoPagoDto } from './dto/update-metodo-pago.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

@ApiTags('Métodos de pago')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('metodos-pago')
export class MetodosPagoController {
  constructor(private readonly metodosPagoService: MetodosPagoService) {}

  @Post()
  @RequierePermiso(ModuloPermiso.METODOS_PAGO, AccionPermiso.CREAR)
  create(@Body() dto: CreateMetodoPagoDto) {
    return this.metodosPagoService.create(dto);
  }

  @Get()
  @RequierePermiso(ModuloPermiso.METODOS_PAGO, AccionPermiso.VER)
  findAll() {
    return this.metodosPagoService.findAll();
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.METODOS_PAGO, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.metodosPagoService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.METODOS_PAGO, AccionPermiso.EDITAR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMetodoPagoDto) {
    return this.metodosPagoService.update(id, dto);
  }

  @Delete(':id')
  @RequierePermiso(ModuloPermiso.METODOS_PAGO, AccionPermiso.ELIMINAR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.metodosPagoService.remove(id);
  }
}
