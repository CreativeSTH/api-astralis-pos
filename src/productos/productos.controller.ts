import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ProductosService } from './productos.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { productoImagenUploadOptions } from '../common/config/upload.config';

@ApiTags('Productos')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Post()
  @RequierePermiso(ModuloPermiso.PRODUCTOS, AccionPermiso.CREAR)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Crear producto (campo opcional "imagen" como archivo)',
  })
  @UseInterceptors(FileInterceptor('imagen', productoImagenUploadOptions))
  create(
    @Body() dto: CreateProductoDto,
    @UploadedFile() imagen?: Express.Multer.File,
  ) {
    return this.productosService.create(dto, imagen);
  }

  @Get()
  @RequierePermiso(ModuloPermiso.PRODUCTOS, AccionPermiso.VER)
  findAll() {
    return this.productosService.findAll();
  }

  @Get('codigo-barras/:codigo')
  @RequierePermiso(ModuloPermiso.PRODUCTOS, AccionPermiso.VER)
  @ApiOperation({
    summary:
      'Buscar producto por código de barras (usado por el lector en el POS)',
  })
  findByCodigoBarras(@Param('codigo') codigo: string) {
    return this.productosService.findByCodigoBarras(codigo);
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.PRODUCTOS, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productosService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.PRODUCTOS, AccionPermiso.EDITAR)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Actualizar producto (campo opcional "imagen" como archivo)',
  })
  @UseInterceptors(FileInterceptor('imagen', productoImagenUploadOptions))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductoDto,
    @UploadedFile() imagen?: Express.Multer.File,
  ) {
    return this.productosService.update(id, dto, imagen);
  }

  @Delete(':id')
  @RequierePermiso(ModuloPermiso.PRODUCTOS, AccionPermiso.ELIMINAR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productosService.remove(id);
  }
}
