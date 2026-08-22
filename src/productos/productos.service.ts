import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Producto } from './entities/producto.entity';
import { Categoria } from '../categorias/entities/categoria.entity';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { TipoImpuesto } from '../common/enums/tipo-impuesto.enum';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum';
import { InventarioService } from '../inventario/inventario.service';
import { ProveedoresService } from '../proveedores/proveedores.service';

@Injectable()
export class ProductosService extends TenantBaseService<Producto> {
  constructor(
    @InjectRepository(Producto) repository: Repository<Producto>,
    @InjectRepository(Categoria)
    private readonly categoriasRepository: Repository<Categoria>,
    cls: ClsService,
    private readonly inventarioService: InventarioService,
    private readonly proveedoresService: ProveedoresService,
  ) {
    super(repository, cls, 'Producto');
  }

  findAll() {
    return this.findAllForTenant({ activo: true }, { categorias: true });
  }

  findOne(id: string) {
    return this.findOneForTenant(id, { categorias: true });
  }

  /** Nunca confía en IDs crudos del cliente sin validar que la categoría pertenezca al negocio del tenant. */
  private async resolverCategorias(
    categoriaIds?: string[],
  ): Promise<Categoria[] | undefined> {
    if (categoriaIds === undefined) return undefined;
    if (categoriaIds.length === 0) return [];
    return this.categoriasRepository.find({
      where: { id: In(categoriaIds), negocioId: this.getNegocioId() },
    });
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
    const { stockInicial, categoriaIds, proveedores, ...datosProducto } =
      this.normalizarImpuesto(dto);
    const categorias = await this.resolverCategorias(categoriaIds);
    const producto = await this.createForTenant({
      ...datosProducto,
      categorias,
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

    if (proveedores?.length) {
      for (const fila of proveedores) {
        if (
          !fila ||
          !(Number(fila.costo) >= 0) ||
          (!fila.proveedorId && !fila.proveedorNuevo)
        ) {
          continue;
        }
        await this.proveedoresService.vincularProducto(producto.id, fila);
      }
    }

    return producto;
  }

  async update(
    id: string,
    dto: UpdateProductoDto,
    imagen?: Express.Multer.File,
  ): Promise<Producto> {
    const { categoriaIds, ...resto } = this.quitarStockInicial(
      this.normalizarImpuesto(dto),
    );
    const categorias = await this.resolverCategorias(categoriaIds);

    // Cargar con `categorias` ya poblado es necesario para que TypeORM pueda
    // reconciliar la tabla join (quitar los vínculos viejos que ya no aplican),
    // no solo insertar los nuevos — ver nota de riesgo en el plan de esta fase.
    const producto = await this.findOneForTenant(id, { categorias: true });
    const imagenAnterior = producto.imagenUrl;
    Object.assign(producto, resto);
    if (categorias !== undefined) {
      producto.categorias = categorias;
    }
    if (imagen) {
      producto.imagenUrl = this.buildImagenUrl(imagen);
    }
    const actualizado = await this.repository.save(producto);

    if (imagen && imagenAnterior) {
      await this.eliminarArchivoImagen(imagenAnterior);
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
   * `stockInicial` y `proveedores` no son columnas de Producto — solo se usan en
   * create() para cargar inventario/vínculos de proveedor tras guardar. En
   * update() ninguno de los dos se toca (stock sigue el flujo de "Ajustar
   * stock", proveedores el de los endpoints `/proveedores/producto/:id`), así
   * que aquí solo se necesita el tipo sin esos campos para que updateForTenant
   * lo acepte.
   */
  private quitarStockInicial<
    T extends { stockInicial?: unknown; proveedores?: unknown },
  >(dto: T): Omit<T, 'stockInicial' | 'proveedores'> {
    const resto = { ...dto };
    delete resto.stockInicial;
    delete resto.proveedores;
    return resto;
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
