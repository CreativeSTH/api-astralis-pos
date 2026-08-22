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
import { SucursalesService } from './sucursales.service';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuario } from '../common/enums/rol-usuario.enum';

@ApiTags('Sucursales')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sucursales')
export class SucursalesController {
  constructor(private readonly sucursalesService: SucursalesService) {}

  @Post()
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  create(@Body() dto: CreateSucursalDto) {
    return this.sucursalesService.create(dto);
  }

  @Get()
  findAll() {
    return this.sucursalesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sucursalesService.findOne(id);
  }

  @Patch(':id')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSucursalDto,
  ) {
    return this.sucursalesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.sucursalesService.remove(id);
  }
}
