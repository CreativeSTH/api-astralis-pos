import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ProveedoresService } from './proveedores.service';
import type { DocumentosProveedor } from './proveedores.service';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { VincularProveedorDto } from './dto/vincular-proveedor.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { proveedorDocumentoUploadOptions } from '../common/config/upload.config';

const DOCUMENTOS_INTERCEPTOR = FileFieldsInterceptor(
  [
    { name: 'rutDocumento', maxCount: 1 },
    { name: 'camaraComercioDocumento', maxCount: 1 },
    { name: 'certificacionBancariaDocumento', maxCount: 1 },
  ],
  proveedorDocumentoUploadOptions,
);

@ApiTags('Proveedores')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Post()
  @RequierePermiso(ModuloPermiso.PROVEEDORES, AccionPermiso.CREAR)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Crear proveedor (campos opcionales "rutDocumento", "camaraComercioDocumento", "certificacionBancariaDocumento" como archivos)',
  })
  @UseInterceptors(DOCUMENTOS_INTERCEPTOR)
  create(
    @Body() dto: CreateProveedorDto,
    @UploadedFiles() documentos?: DocumentosProveedor,
  ) {
    return this.proveedoresService.create(dto, documentos);
  }

  @Get()
  @RequierePermiso(ModuloPermiso.PROVEEDORES, AccionPermiso.VER)
  findAll() {
    return this.proveedoresService.findAll();
  }

  @Get('producto/:productoId')
  @RequierePermiso(ModuloPermiso.PROVEEDORES, AccionPermiso.VER)
  @ApiOperation({
    summary: 'Proveedores vinculados a un producto, con su costo pactado',
  })
  listarPorProducto(@Param('productoId', ParseUUIDPipe) productoId: string) {
    return this.proveedoresService.listarPorProducto(productoId);
  }

  @Post('producto/:productoId')
  @RequierePermiso(ModuloPermiso.PROVEEDORES, AccionPermiso.CREAR)
  @ApiOperation({
    summary: 'Vincular (o actualizar el costo de) un proveedor a un producto',
  })
  vincularProducto(
    @Param('productoId', ParseUUIDPipe) productoId: string,
    @Body() dto: VincularProveedorDto,
  ) {
    return this.proveedoresService.vincularProducto(productoId, dto);
  }

  @Delete('producto/:productoId/:proveedorId')
  @RequierePermiso(ModuloPermiso.PROVEEDORES, AccionPermiso.ELIMINAR)
  desvincularProducto(
    @Param('productoId', ParseUUIDPipe) productoId: string,
    @Param('proveedorId', ParseUUIDPipe) proveedorId: string,
  ) {
    return this.proveedoresService.desvincularProducto(productoId, proveedorId);
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.PROVEEDORES, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.proveedoresService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.PROVEEDORES, AccionPermiso.EDITAR)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Actualizar proveedor (campos opcionales "rutDocumento", "camaraComercioDocumento", "certificacionBancariaDocumento" como archivos)',
  })
  @UseInterceptors(DOCUMENTOS_INTERCEPTOR)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProveedorDto,
    @UploadedFiles() documentos?: DocumentosProveedor,
  ) {
    return this.proveedoresService.update(id, dto, documentos);
  }

  @Delete(':id')
  @RequierePermiso(ModuloPermiso.PROVEEDORES, AccionPermiso.ELIMINAR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.proveedoresService.remove(id);
  }
}
