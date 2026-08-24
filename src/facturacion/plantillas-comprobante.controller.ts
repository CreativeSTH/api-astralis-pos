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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PlantillasComprobanteService } from './plantillas-comprobante.service';
import { CreatePlantillaDto } from './dto/create-plantilla.dto';
import { UpdatePlantillaDto } from './dto/update-plantilla.dto';
import { TipoComprobante } from '../common/enums/tipo-comprobante.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { plantillaLogoUploadOptions } from '../common/config/upload.config';

@ApiTags('Facturacion')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('plantillas-comprobante')
export class PlantillasComprobanteController {
  constructor(private readonly plantillasService: PlantillasComprobanteService) {}

  @Post()
  @RequierePermiso(ModuloPermiso.FACTURACION, AccionPermiso.CREAR)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Crear plantilla de recibo/factura (campo opcional "logo" como archivo)' })
  @UseInterceptors(FileInterceptor('logo', plantillaLogoUploadOptions))
  create(@Body() dto: CreatePlantillaDto, @UploadedFile() logo?: Express.Multer.File) {
    return this.plantillasService.create(dto, logo);
  }

  @Get()
  @RequierePermiso(ModuloPermiso.FACTURACION, AccionPermiso.VER)
  @ApiQuery({ name: 'tipo', enum: TipoComprobante, required: false })
  findAll(@Query('tipo') tipo?: TipoComprobante) {
    return this.plantillasService.findAll(tipo);
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.FACTURACION, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.plantillasService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.FACTURACION, AccionPermiso.EDITAR)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Actualizar plantilla (campo opcional "logo" como archivo)' })
  @UseInterceptors(FileInterceptor('logo', plantillaLogoUploadOptions))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlantillaDto,
    @UploadedFile() logo?: Express.Multer.File,
  ) {
    return this.plantillasService.update(id, dto, logo);
  }

  @Delete(':id')
  @RequierePermiso(ModuloPermiso.FACTURACION, AccionPermiso.ELIMINAR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.plantillasService.remove(id);
  }
}
