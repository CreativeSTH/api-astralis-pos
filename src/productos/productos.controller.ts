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
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuario } from '../common/enums/rol-usuario.enum';
import { productoImagenUploadOptions } from '../common/config/upload.config';

@ApiTags('Productos')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Post()
  @Roles(RolUsuario.ADMIN_NEGOCIO)
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
  findAll() {
    return this.productosService.findAll();
  }

  @Get('codigo-barras/:codigo')
  @ApiOperation({
    summary:
      'Buscar producto por código de barras (usado por el lector en el POS)',
  })
  findByCodigoBarras(@Param('codigo') codigo: string) {
    return this.productosService.findByCodigoBarras(codigo);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productosService.findOne(id);
  }

  @Patch(':id')
  @Roles(RolUsuario.ADMIN_NEGOCIO)
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
  @Roles(RolUsuario.ADMIN_NEGOCIO)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productosService.remove(id);
  }
}
