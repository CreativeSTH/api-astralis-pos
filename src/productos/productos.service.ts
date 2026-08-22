import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Producto } from './entities/producto.entity';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { TipoImpuesto } from '../common/enums/tipo-impuesto.enum';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum';
import { InventarioService } from '../inventario/inventario.service';

@Injectable()
export class ProductosService extends TenantBaseService<Producto> {
  constructor(
    @InjectRepository(Producto) repository: Repository<Producto>,
    cls: ClsService,
    private readonly inventarioService: InventarioService,
  ) {
    super(repository, cls, 'Producto');
  }

  findAll() {
    return this.findAllForTenant({ activo: true });
  }

  findOne(id: string) {
    return this.findOneForTenant(id);
  }

  /** Usado por el flujo de venta al escanear un código de barras. */
  async findByCodigoBarras(codigoBarras: string): Promise<Producto> {
    const producto = await this.repository.findOne({
      where: { codigoBarras, negocioId: this.getNegocioId(), activo: true },
    });
    if (!producto) {
      throw new NotFoundException(
        `No hay producto con código de barras ${codigoBarras}`,
      );
    }
    return producto;
  }

  async create(
    dto: CreateProductoDto,
    imagen?: Express.Multer.File,
  ): Promise<Producto> {
    if (dto.codigoBarras) {
      const existente = await this.repository.findOne({
        where: {
          codigoBarras: dto.codigoBarras,
          negocioId: this.getNegocioId(),
        },
      });
      if (existente) {
        throw new ConflictException(
          `Ya existe un producto con código de barras ${dto.codigoBarras}`,
        );
      }
    }
    const { stockInicial, ...datosProducto } = this.normalizarImpuesto(dto);
    const producto = await this.createForTenant({
      ...datosProducto,
      imagenUrl: imagen ? this.buildImagenUrl(imagen) : undefined,
    });

    if (stockInicial?.length) {
      for (const item of stockInicial) {
        if (!item?.bodegaId || !(Number(item.cantidad) > 0)) continue;
        await this.inventarioService.ajustarStock({
          productoId: producto.id,
          bodegaId: item.bodegaId,
          tipo: TipoMovimientoInventario.ENTRADA,
          cantidad: Number(item.cantidad),
          motivo: 'Carga inicial',
        });
      }
    }

    return producto;
  }

  async update(
    id: string,
    dto: UpdateProductoDto,
    imagen?: Express.Multer.File,
  ): Promise<Producto> {
    const datosProducto = this.quitarStockInicial(this.normalizarImpuesto(dto));
    if (!imagen) {
      return this.updateForTenant(id, datosProducto);
    }

    const anterior = await this.findOneForTenant(id);
    const actualizado = await this.updateForTenant(id, {
      ...datosProducto,
      imagenUrl: this.buildImagenUrl(imagen),
    });
    if (anterior.imagenUrl) {
      await this.eliminarArchivoImagen(anterior.imagenUrl);
    }
    return actualizado;
  }

  async remove(id: string) {
    await this.updateForTenant(id, { activo: false });
  }

  /** EXCLUIDO/EXENTO tributan siempre al 0%, sin importar lo que llegue en el body. */
  private normalizarImpuesto<
    T extends { tipoImpuesto?: TipoImpuesto; porcentajeImpuesto?: number },
  >(dto: T): T {
    if (dto.tipoImpuesto && dto.tipoImpuesto !== TipoImpuesto.GRAVADO) {
      return { ...dto, porcentajeImpuesto: 0 };
    }
    return dto;
  }

  /**
   * `stockInicial` no es una columna de Producto — solo se usa en create() para
   * cargar inventario tras guardar. En update() no se actúa sobre stock (eso
   * sigue el flujo de "Ajustar stock"), así que aquí solo se necesita el tipo
   * sin ese campo para que updateForTenant lo acepte.
   */
  private quitarStockInicial<T extends { stockInicial?: unknown }>(
    dto: T,
  ): Omit<T, 'stockInicial'> {
    return dto;
  }

  private buildImagenUrl(imagen: Express.Multer.File): string {
    return `/uploads/productos/${imagen.filename}`;
  }

  private async eliminarArchivoImagen(imagenUrl: string): Promise<void> {
    const nombreArchivo = imagenUrl.split('/').pop();
    if (!nombreArchivo) return;
    try {
      await unlink(join(process.cwd(), 'uploads', 'productos', nombreArchivo));
    } catch {
      // El archivo ya no existe o no se pudo borrar — no es crítico, se ignora.
    }
  }
}
