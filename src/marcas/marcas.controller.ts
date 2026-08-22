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
import { MarcasService } from './marcas.service';
import { CreateMarcaDto } from './dto/create-marca.dto';
import { UpdateMarcaDto } from './dto/update-marca.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuario } from '../common/enums/rol-usuario.enum';

@ApiTags('Marcas')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('marcas')
export class MarcasController {
  constructor(private readonly marcasService: MarcasService) {}

  @Post()
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  create(@Body() dto: CreateMarcaDto) {
    return this.marcasService.create(dto);
  }

  @Get()
  findAll() {
    return this.marcasService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.marcasService.findOne(id);
  }

  @Patch(':id')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMarcaDto) {
    return this.marcasService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.marcasService.remove(id);
  }
}
