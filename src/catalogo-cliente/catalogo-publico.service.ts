import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inventario } from '../inventario/entities/inventario.entity';
import { TiendaOnlineService } from '../tienda-online/tienda-online.service';

export interface ProductoCatalogoPublico {
  id: string;
  nombre: string;
  descripcion: string | null;
  precioVenta: number;
  porcentajeImpuesto: number;
  imagenUrl: string | null;
}

@Injectable()
export class CatalogoPublicoService {
  constructor(
    @InjectRepository(Inventario)
    private readonly inventarioRepo: Repository<Inventario>,
    private readonly tiendaOnlineService: TiendaOnlineService,
  ) {}

  async obtenerCatalogo(
    negocioId: string,
  ): Promise<{ activa: boolean; productos: ProductoCatalogoPublico[] }> {
    const { bodegaId, activo } =
      await this.tiendaOnlineService.obtenerConfiguracionPublica(negocioId);

    if (!activo || !bodegaId) {
      return { activa: false, productos: [] };
    }

    const filas = await this.inventarioRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.producto', 'producto')
      .where('inv.negocio_id = :negocioId', { negocioId })
      .andWhere('inv.bodega_id = :bodegaId', { bodegaId })
      .andWhere('inv.cantidad > 0')
      .andWhere('producto.activo = true')
      .getMany();

    const productos: ProductoCatalogoPublico[] = filas.map((fila) => ({
      id: fila.producto.id,
      nombre: fila.producto.nombre,
      descripcion: fila.producto.descripcion ?? null,
      precioVenta: Number(fila.producto.precioVenta),
      porcentajeImpuesto: Number(fila.producto.porcentajeImpuesto),
      imagenUrl: fila.producto.imagenUrl ?? null,
    }));

    return { activa: true, productos };
  }
}
