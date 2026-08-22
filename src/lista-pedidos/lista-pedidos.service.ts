import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { ItemPedido } from './entities/item-pedido.entity';
import { Producto } from '../productos/entities/producto.entity';
import { CreateItemPedidoDto } from './dto/create-item-pedido.dto';

@Injectable()
export class ListaPedidosService extends TenantBaseService<ItemPedido> {
  constructor(
    @InjectRepository(ItemPedido) repository: Repository<ItemPedido>,
    @InjectRepository(Producto)
    private readonly productosRepository: Repository<Producto>,
    cls: ClsService,
  ) {
    super(repository, cls, 'Item de pedido');
  }

  findAll(comprado?: boolean) {
    return this.findAllForTenant(comprado !== undefined ? { comprado } : {});
  }

  /** Idempotente: si el producto ya está pendiente en la lista, no lo duplica. */
  async agregar(dto: CreateItemPedidoDto): Promise<ItemPedido> {
    const negocioId = this.getNegocioId();
    const existente = await this.repository.findOne({
      where: { negocioId, productoId: dto.productoId, comprado: false },
    });
    if (existente) return existente;

    const producto = await this.productosRepository.findOne({
      where: { id: dto.productoId, negocioId },
    });
    if (!producto) {
      throw new NotFoundException(`Producto con ID ${dto.productoId} no encontrado`);
    }

    return this.createForTenant({
      productoId: producto.id,
      nombreProducto: producto.nombre,
      agregadoPor: this.cls.get<string>('usuarioId'),
    });
  }

  async marcarComprado(id: string): Promise<ItemPedido> {
    return this.updateForTenant(id, { comprado: true });
  }

  async remove(id: string): Promise<void> {
    const item = await this.findOneForTenant(id);
    await this.repository.remove(item);
  }
}
