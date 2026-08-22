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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NegociosService } from './negocios.service';
import { CreateNegocioDto } from './dto/create-negocio.dto';
import { UpdateNegocioDto } from './dto/update-negocio.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuario } from '../common/enums/rol-usuario.enum';

@ApiTags('Negocios')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.SUPER_ADMIN)
@Controller('negocios')
export class NegociosController {
  constructor(private readonly negociosService: NegociosService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear negocio + su admin inicial (solo SUPER_ADMIN)',
  })
  create(@Body() dto: CreateNegocioDto) {
    return this.negociosService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar negocios' })
  findAll() {
    return this.negociosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.negociosService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNegocioDto,
  ) {
    return this.negociosService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desactivar negocio (soft delete)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.negociosService.remove(id);
  }
}
