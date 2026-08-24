import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GraficosService } from './graficos.service';
import { CreateGraficoDto } from './dto/create-grafico.dto';
import { UpdateGraficoDto } from './dto/update-grafico.dto';
import { ConfiguracionGraficoDto } from './dto/configuracion-grafico.dto';
import { DatosGraficoQueryDto } from './dto/datos-grafico-query.dto';
import { UpsertLayoutDto } from './dto/upsert-layout.dto';
import { PaginaLayoutGraficos } from '../common/enums/pagina-layout-graficos.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

@ApiTags('Graficos')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('graficos')
export class GraficosController {
  constructor(private readonly graficosService: GraficosService) {}

  @Get('fuentes')
  @RequierePermiso(ModuloPermiso.GRAFICOS, AccionPermiso.VER)
  @ApiOperation({ summary: 'Catálogo de datos del negocio que se pueden graficar' })
  fuentes() {
    return this.graficosService.fuentes();
  }

  @Post('preview')
  @RequierePermiso(ModuloPermiso.GRAFICOS, AccionPermiso.VER)
  @ApiOperation({ summary: 'Calcula las series de una configuración borrador, sin guardarla' })
  preview(@Body() dto: ConfiguracionGraficoDto) {
    return this.graficosService.preview(dto);
  }

  @Get('layout/:pagina')
  @RequierePermiso(ModuloPermiso.GRAFICOS, AccionPermiso.VER)
  @ApiOperation({ summary: 'Layout de gráficos guardado para Dashboard o Reportes' })
  obtenerLayout(@Param('pagina', new ParseEnumPipe(PaginaLayoutGraficos)) pagina: PaginaLayoutGraficos) {
    return this.graficosService.obtenerLayout(pagina);
  }

  @Put('layout/:pagina')
  @RequierePermiso(ModuloPermiso.GRAFICOS, AccionPermiso.EDITAR)
  @ApiOperation({ summary: 'Reemplaza el layout completo de gráficos de Dashboard o Reportes' })
  guardarLayout(
    @Param('pagina', new ParseEnumPipe(PaginaLayoutGraficos)) pagina: PaginaLayoutGraficos,
    @Body() dto: UpsertLayoutDto,
  ) {
    return this.graficosService.guardarLayout(pagina, dto);
  }

  @Post()
  @RequierePermiso(ModuloPermiso.GRAFICOS, AccionPermiso.CREAR)
  create(@Body() dto: CreateGraficoDto) {
    return this.graficosService.create(dto);
  }

  @Get()
  @RequierePermiso(ModuloPermiso.GRAFICOS, AccionPermiso.VER)
  findAll() {
    return this.graficosService.findAll();
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.GRAFICOS, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.graficosService.findOne(id);
  }

  @Get(':id/datos')
  @RequierePermiso(ModuloPermiso.GRAFICOS, AccionPermiso.VER)
  @ApiOperation({ summary: 'Series calculadas de un gráfico guardado, con override opcional de fechas' })
  datos(@Param('id', ParseUUIDPipe) id: string, @Query() query: DatosGraficoQueryDto) {
    return this.graficosService.datos(id, query.desde, query.hasta);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.GRAFICOS, AccionPermiso.EDITAR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGraficoDto) {
    return this.graficosService.update(id, dto);
  }

  @Delete(':id')
  @RequierePermiso(ModuloPermiso.GRAFICOS, AccionPermiso.ELIMINAR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.graficosService.remove(id);
  }
}
