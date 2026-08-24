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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { CuponesService } from './cupones.service';
import { PromocionesPricingService } from './promociones-pricing.service';
import { CuponValidacionService } from './cupon-validacion.service';
import { CreatePromocionDto } from './dto/create-promocion.dto';
import { UpdatePromocionDto } from './dto/update-promocion.dto';
import { ValidarCuponDto } from './dto/validar-cupon.dto';
import { TipoPromocion } from '../common/enums/tipo-promocion.enum';
import { Producto } from '../productos/entities/producto.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequierePermiso } from '../common/decorators/requiere-permiso.decorator';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';
import { AccionPermiso } from '../common/enums/accion-permiso.enum';

@ApiTags('Cupones')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cupones')
export class CuponesController {
  constructor(
    private readonly cuponesService: CuponesService,
    private readonly pricingService: PromocionesPricingService,
    private readonly validacionService: CuponValidacionService,
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
    private readonly cls: ClsService,
  ) {}

  @Post()
  @RequierePermiso(ModuloPermiso.CUPONES, AccionPermiso.CREAR)
  create(@Body() dto: CreatePromocionDto) {
    return this.cuponesService.create(dto);
  }

  @Get()
  @RequierePermiso(ModuloPermiso.CUPONES, AccionPermiso.VER)
  @ApiQuery({ name: 'tipo', enum: TipoPromocion, required: false })
  findAll(@Query('tipo') tipo?: TipoPromocion) {
    return this.cuponesService.findAll(tipo);
  }

  /**
   * Precios vigentes por promoción automática para el catálogo del POS. Gated
   * por VENTAS:VER (no CUPONES) porque cualquier cajero que ve el catálogo
   * necesita esto — igual precedente que el selector Recibo/Factura, que se
   * habilita con VENTAS:CREAR y no con FACTURACION.
   */
  @Get('precios-vigentes')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.VER)
  @ApiOperation({ summary: 'Mapa productoId -> precio vigente por promociones automáticas activas' })
  @ApiQuery({ name: 'sucursalId', required: true })
  @ApiQuery({ name: 'bodegaId', required: true })
  async preciosVigentes(
    @Query('sucursalId', ParseUUIDPipe) sucursalId: string,
    @Query('bodegaId', ParseUUIDPipe) bodegaId: string,
  ) {
    const negocioId = this.cls.get<string>('negocioId');
    const productos = await this.productoRepository.find({
      where: { negocioId, activo: true },
      relations: { categorias: true },
    });
    const precios = await this.pricingService.preciosVigentes(negocioId, sucursalId, bodegaId, productos);
    return Array.from(precios.entries()).map(([productoId, info]) => ({ productoId, ...info }));
  }

  /** Validación previa (botón "Redimir" del carrito) — no redime todavía, eso ocurre al crear la venta. */
  @Post('validar')
  @RequierePermiso(ModuloPermiso.VENTAS, AccionPermiso.CREAR)
  @ApiOperation({ summary: 'Valida un código de cupón contra el carrito actual, sin redimirlo' })
  async validar(@Body() dto: ValidarCuponDto) {
    const negocioId = this.cls.get<string>('negocioId');
    return this.validacionService.validar(negocioId, dto);
  }

  @Get(':id')
  @RequierePermiso(ModuloPermiso.CUPONES, AccionPermiso.VER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cuponesService.findOne(id);
  }

  @Patch(':id')
  @RequierePermiso(ModuloPermiso.CUPONES, AccionPermiso.EDITAR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromocionDto) {
    return this.cuponesService.update(id, dto);
  }

  @Delete(':id')
  @RequierePermiso(ModuloPermiso.CUPONES, AccionPermiso.ELIMINAR)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.cuponesService.remove(id);
  }
}
