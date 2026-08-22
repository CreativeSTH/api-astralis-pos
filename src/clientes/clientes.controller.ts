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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { CreateNotaClienteDto } from './dto/create-nota-cliente.dto';
import { CreateDireccionClienteDto } from './dto/create-direccion-cliente.dto';
import { UpdateDireccionClienteDto } from './dto/update-direccion-cliente.dto';
import { BuscarClientesDto } from './dto/buscar-clientes.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

@ApiTags('Clientes')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Post()
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.CREAR)
  create(@Body() dto: CreateClienteDto) {
    return this.clientesService.create(dto);
  }

  @Get()
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.VER)
  findAll() {
    return this.clientesService.findAll();
  }

  @Get('buscar')
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.VER)
  buscar(@Query() filtros: BuscarClientesDto) {
    return this.clientesService.buscar(filtros);
  }

  @Get('estadisticas')
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.VER)
  estadisticas() {
    return this.clientesService.estadisticas();
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientesService.findOne(id);
  }

  @Get(':id/credito')
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.VER)
  @ApiOperation({
    summary:
      'Verificar si el cliente puede tomar un crédito por el monto indicado',
  })
  verificarCredito(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('monto') monto: number,
  ) {
    return this.clientesService.verificarCredito(id, Number(monto));
  }

  @Get(':id/notas')
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.VER)
  listarNotas(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientesService.listarNotas(id);
  }

  @Post(':id/notas')
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.CREAR)
  agregarNota(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateNotaClienteDto,
  ) {
    return this.clientesService.agregarNota(id, dto);
  }

  @Get(':id/direcciones')
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.VER)
  listarDirecciones(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientesService.listarDirecciones(id);
  }

  @Post(':id/direcciones')
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.CREAR)
  agregarDireccion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDireccionClienteDto,
  ) {
    return this.clientesService.agregarDireccion(id, dto);
  }

  @Patch(':id/direcciones/:direccionId')
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.EDITAR)
  actualizarDireccion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('direccionId', ParseUUIDPipe) direccionId: string,
    @Body() dto: UpdateDireccionClienteDto,
  ) {
    return this.clientesService.actualizarDireccion(id, direccionId, dto);
  }

  @Delete(':id/direcciones/:direccionId')
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.ELIMINAR)
  eliminarDireccion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('direccionId', ParseUUIDPipe) direccionId: string,
  ) {
    return this.clientesService.eliminarDireccion(id, direccionId);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.EDITAR)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClienteDto,
  ) {
    return this.clientesService.update(id, dto);
  }

  @Post(':id/bloquear')
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.ELIMINAR)
  bloquear(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motivo') motivo: string,
  ) {
    return this.clientesService.bloquear(id, motivo);
  }

  @Post(':id/desbloquear')
  @RequierePermiso(ModuloPermiso.CLIENTES, AccionPermiso.ELIMINAR)
  desbloquear(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientesService.desbloquear(id);
  }
}
