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
import { LineasService } from './lineas.service';
import { CreateLineaDto } from './dto/create-linea.dto';
import { UpdateLineaDto } from './dto/update-linea.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuario } from '../common/enums/rol-usuario.enum';

@ApiTags('Lineas')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lineas')
export class LineasController {
  constructor(private readonly lineasService: LineasService) {}

  @Post()
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  create(@Body() dto: CreateLineaDto) {
    return this.lineasService.create(dto);
  }

  @Get()
  findAll(@Query('marcaId') marcaId?: string) {
    return this.lineasService.findAll(marcaId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.lineasService.findOne(id);
  }

  @Patch(':id')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLineaDto) {
    return this.lineasService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.lineasService.remove(id);
  }
}
