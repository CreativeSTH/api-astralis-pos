import {
  Body,
  Controller,
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
import { BuscarClientesDto } from './dto/buscar-clientes.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuario } from '../common/enums/rol-usuario.enum';

@ApiTags('Clientes')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Post()
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  create(@Body() dto: CreateClienteDto) {
    return this.clientesService.create(dto);
  }

  @Get()
  findAll() {
    return this.clientesService.findAll();
  }

  @Get('buscar')
  buscar(@Query() filtros: BuscarClientesDto) {
    return this.clientesService.buscar(filtros);
  }

  @Get('estadisticas')
  estadisticas() {
    return this.clientesService.estadisticas();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientesService.findOne(id);
  }

  @Get(':id/credito')
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
  listarNotas(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientesService.listarNotas(id);
  }

  @Post(':id/notas')
  agregarNota(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateNotaClienteDto,
  ) {
    return this.clientesService.agregarNota(id, dto);
  }

  @Patch(':id')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClienteDto,
  ) {
    return this.clientesService.update(id, dto);
  }

  @Post(':id/bloquear')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  bloquear(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motivo') motivo: string,
  ) {
    return this.clientesService.bloquear(id, motivo);
  }

  @Post(':id/desbloquear')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  desbloquear(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientesService.desbloquear(id);
  }
}
