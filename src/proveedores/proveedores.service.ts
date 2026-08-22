import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Proveedor } from './entities/proveedor.entity';
import { ProductoProveedor } from './entities/producto-proveedor.entity';
import { CreateProveedorDto } from './dto/create-proveedor.dto';
import { UpdateProveedorDto } from './dto/update-proveedor.dto';
import { VincularProveedorDto } from './dto/vincular-proveedor.dto';

export interface DocumentosProveedor {
  rutDocumento?: Express.Multer.File[];
  camaraComercioDocumento?: Express.Multer.File[];
  certificacionBancariaDocumento?: Express.Multer.File[];
}

@Injectable()
export class ProveedoresService extends TenantBaseService<Proveedor> {
  constructor(
    @InjectRepository(Proveedor) repository: Repository<Proveedor>,
    @InjectRepository(ProductoProveedor)
    private readonly productoProveedorRepository: Repository<ProductoProveedor>,
    cls: ClsService,
  ) {
    super(repository, cls, 'Proveedor');
  }

  findAll() {
    return this.findAllForTenant({ activo: true });
  }

  findOne(id: string) {
    return this.findOneForTenant(id);
  }

  async create(
    dto: CreateProveedorDto,
    documentos?: DocumentosProveedor,
  ): Promise<Proveedor> {
    return this.createForTenant({
      ...dto,
      ...this.buildDocumentoUrls(documentos),
    });
  }

  async update(
    id: string,
    dto: UpdateProveedorDto,
    documentos?: DocumentosProveedor,
  ): Promise<Proveedor> {
    const proveedor = await this.findOneForTenant(id);
    const urls = this.buildDocumentoUrls(documentos);
    const anteriores = {
      rutDocumentoUrl: proveedor.rutDocumentoUrl,
      camaraComercioUrl: proveedor.camaraComercioUrl,
      certificacionBancariaUrl: proveedor.certificacionBancariaUrl,
    };
    Object.assign(proveedor, dto, urls);
    const actualizado = await this.repository.save(proveedor);

    for (const [campo, urlNueva] of Object.entries(urls)) {
      const urlAnterior = anteriores[campo as keyof typeof anteriores];
      if (urlNueva && urlAnterior) {
        await this.eliminarArchivoDocumento(urlAnterior);
      }
    }
    return actualizado;
  }

  async remove(id: string): Promise<void> {
    await this.updateForTenant(id, { activo: false });
  }

  /** Lista los proveedores vinculados a un producto, con su costo pactado. */
  async listarPorProducto(productoId: string): Promise<ProductoProveedor[]> {
    return this.productoProveedorRepository.find({
      where: { negocioId: this.getNegocioId(), productoId, activo: true },
      relations: { proveedor: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Vincula un proveedor a un producto con un costo. Si el proveedor ya estaba
   * vinculado, actualiza el costo (upsert) en vez de duplicar el vínculo.
   * Si llega `proveedorNuevo`, lo crea antes de vincular.
   */
  async vincularProducto(
    productoId: string,
    dto: VincularProveedorDto,
  ): Promise<ProductoProveedor> {
    const negocioId = this.getNegocioId();
    let proveedorId = dto.proveedorId;

    if (!proveedorId) {
      if (!dto.proveedorNuevo) {
        throw new BadRequestException(
          'Debe enviarse proveedorId o proveedorNuevo',
        );
      }
      const nuevo = await this.createForTenant({
        nombre: dto.proveedorNuevo.nombre,
      });
      proveedorId = nuevo.id;
    } else {
      await this.findOneForTenant(proveedorId);
    }

    let vinculo = await this.productoProveedorRepository.findOne({
      where: { negocioId, productoId, proveedorId },
    });
    if (vinculo) {
      vinculo.costo = dto.costo;
      vinculo.referencia = dto.referencia;
      vinculo.activo = true;
    } else {
      vinculo = this.productoProveedorRepository.create({
        negocioId,
        productoId,
        proveedorId,
        costo: dto.costo,
        referencia: dto.referencia,
      });
    }
    return this.productoProveedorRepository.save(vinculo);
  }

  async desvincularProducto(
    productoId: string,
    proveedorId: string,
  ): Promise<void> {
    const vinculo = await this.productoProveedorRepository.findOne({
      where: { negocioId: this.getNegocioId(), productoId, proveedorId },
    });
    if (!vinculo) {
      throw new NotFoundException(
        'Ese proveedor no está vinculado a este producto',
      );
    }
    await this.productoProveedorRepository.remove(vinculo);
  }

  private buildDocumentoUrls(
    documentos?: DocumentosProveedor,
  ): Partial<Proveedor> {
    if (!documentos) return {};
    const urls: Partial<Proveedor> = {};
    if (documentos.rutDocumento?.[0]) {
      urls.rutDocumentoUrl = this.buildUrl(documentos.rutDocumento[0]);
    }
    if (documentos.camaraComercioDocumento?.[0]) {
      urls.camaraComercioUrl = this.buildUrl(
        documentos.camaraComercioDocumento[0],
      );
    }
    if (documentos.certificacionBancariaDocumento?.[0]) {
      urls.certificacionBancariaUrl = this.buildUrl(
        documentos.certificacionBancariaDocumento[0],
      );
    }
    return urls;
  }

  private buildUrl(archivo: Express.Multer.File): string {
    return `/uploads/proveedores/${archivo.filename}`;
  }

  private async eliminarArchivoDocumento(url: string): Promise<void> {
    const nombreArchivo = url.split('/').pop();
    if (!nombreArchivo) return;
    try {
      await unlink(
        join(process.cwd(), 'uploads', 'proveedores', nombreArchivo),
      );
    } catch {
      // El archivo ya no existe o no se pudo borrar — no es crítico, se ignora.
    }
  }
}
