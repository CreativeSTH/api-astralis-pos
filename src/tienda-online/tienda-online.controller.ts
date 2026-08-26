import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';
import { tiendaLogoUploadOptions, tiendaBannerUploadOptions } from '../common/config/upload.config';
import { TiendaOnlineService } from './tienda-online.service';
import { ElegirBodegaDto } from './dto/elegir-bodega.dto';
import { ActualizarPlantillaDto } from './dto/actualizar-plantilla.dto';
import { ActualizarLegalesDto } from './dto/actualizar-legales.dto';

@ApiTags('Tienda online')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tienda-online')
export class TiendaOnlineController {
  constructor(private readonly tiendaOnlineService: TiendaOnlineService) {}

  @Get('configuracion')
  @RequierePermiso(ModuloPermiso.TIENDA_ONLINE, AccionPermiso.VER)
  obtenerConfiguracion() {
    return this.tiendaOnlineService.obtenerConfiguracion();
  }

  @Patch('bodega')
  @RequierePermiso(ModuloPermiso.TIENDA_ONLINE, AccionPermiso.EDITAR)
  elegirBodega(@Body() dto: ElegirBodegaDto) {
    return this.tiendaOnlineService.elegirBodega(dto.bodegaId);
  }

  @Patch('activar')
  @RequierePermiso(ModuloPermiso.TIENDA_ONLINE, AccionPermiso.EDITAR)
  activar() {
    return this.tiendaOnlineService.activar();
  }

  @Patch('desactivar')
  @RequierePermiso(ModuloPermiso.TIENDA_ONLINE, AccionPermiso.EDITAR)
  desactivar() {
    return this.tiendaOnlineService.desactivar();
  }

  @Patch('plantilla')
  @RequierePermiso(ModuloPermiso.TIENDA_ONLINE, AccionPermiso.EDITAR)
  actualizarPlantilla(@Body() dto: ActualizarPlantillaDto) {
    return this.tiendaOnlineService.actualizarPlantilla(dto.plantilla);
  }

  @Patch('legales')
  @RequierePermiso(ModuloPermiso.TIENDA_ONLINE, AccionPermiso.EDITAR)
  actualizarLegales(@Body() dto: ActualizarLegalesDto) {
    return this.tiendaOnlineService.actualizarLegales(dto);
  }

  @Post('logo')
  @RequierePermiso(ModuloPermiso.TIENDA_ONLINE, AccionPermiso.EDITAR)
  @UseInterceptors(FileInterceptor('logo', tiendaLogoUploadOptions))
  async subirLogo(@UploadedFile() logo: Express.Multer.File) {
    const logoUrl = `/uploads/tienda-online/logos/${logo.filename}`;
    await this.tiendaOnlineService.actualizarLogo(logoUrl);
    return { logoUrl };
  }

  @Post('banners')
  @RequierePermiso(ModuloPermiso.TIENDA_ONLINE, AccionPermiso.EDITAR)
  @UseInterceptors(FileInterceptor('banner', tiendaBannerUploadOptions))
  async subirBanner(@UploadedFile() banner: Express.Multer.File) {
    const url = `/uploads/tienda-online/banners/${banner.filename}`;
    const banners = await this.tiendaOnlineService.agregarBanner(url);
    return { banners };
  }

  @Delete('banners/:index')
  @RequierePermiso(ModuloPermiso.TIENDA_ONLINE, AccionPermiso.EDITAR)
  async eliminarBanner(@Param('index', ParseIntPipe) index: number) {
    const banners = await this.tiendaOnlineService.eliminarBanner(index);
    return { banners };
  }
}
