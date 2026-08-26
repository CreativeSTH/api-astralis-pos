import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { JwtClienteAuthGuard } from './guards/jwt-cliente-auth.guard';
import { ClienteActual } from './decorators/cliente-actual.decorator';
import type { JwtClientePayload } from './strategies/jwt-cliente.strategy';
import { ClientePerfilService } from './cliente-perfil.service';
import { ActualizarPerfilClienteDto } from './dto/actualizar-perfil-cliente.dto';
import { CreateDireccionClienteDto } from '../clientes/dto/create-direccion-cliente.dto';

@ApiTags('Perfil de cliente')
@ApiBearerAuth('JWT-cliente')
@Public()
@UseGuards(JwtClienteAuthGuard)
@Controller('catalogo-cliente')
export class ClientePerfilController {
  constructor(private readonly clientePerfilService: ClientePerfilService) {}

  @Get('perfil')
  obtenerPerfil(@ClienteActual() cliente: JwtClientePayload) {
    return this.clientePerfilService.obtenerPerfil(cliente.sub);
  }

  @Patch('perfil')
  actualizarPerfil(
    @ClienteActual() cliente: JwtClientePayload,
    @Body() dto: ActualizarPerfilClienteDto,
  ) {
    return this.clientePerfilService.actualizarPerfil(cliente.sub, dto);
  }

  @Get('direcciones')
  listarDirecciones(@ClienteActual() cliente: JwtClientePayload) {
    return this.clientePerfilService.listarDirecciones(cliente.sub);
  }

  @Post('direcciones')
  agregarDireccion(
    @ClienteActual() cliente: JwtClientePayload,
    @Body() dto: CreateDireccionClienteDto,
  ) {
    return this.clientePerfilService.agregarDireccion(cliente.negocioId, cliente.sub, dto);
  }

  @Get('pedidos')
  listarPedidos() {
    return this.clientePerfilService.listarPedidos();
  }
}
