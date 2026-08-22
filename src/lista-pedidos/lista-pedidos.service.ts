import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { ItemPedido } from './entities/item-pedido.entity';
import { Producto } from '../productos/entities/producto.entity';
import { CreateItemPedidoDto } from './dto/create-item-pedido.dto';
import { RealizarPedidoDto } from './dto/realizar-pedido.dto';
import { ConfirmarIngresoDto } from './dto/confirmar-ingreso.dto';
import { EstadoItemPedido } from '../common/enums/estado-item-pedido.enum';
import { TipoMovimientoInventario } from '../common/enums/tipo-movimiento-inventario.enum';
import { InventarioService } from '../inventario/inventario.service';
import { ProveedoresService } from '../proveedores/proveedores.service';

@Injectable()
export class ListaPedidosService extends TenantBaseService<ItemPedido> {
  constructor(
    @InjectRepository(ItemPedido) repository: Repository<ItemPedido>,
    @InjectRepository(Producto)
    private readonly productosRepository: Repository<Producto>,
    cls: ClsService,
    private readonly inventarioService: InventarioService,
    private readonly proveedoresService: ProveedoresService,
  ) {
    super(repository, cls, 'Item de pedido');
  }

  findAll(estado?: EstadoItemPedido) {
    return this.findAllForTenant(estado ? { estado } : {});
  }

  /** Idempotente: si el producto ya está pendiente en la lista, no lo duplica. */
  async agregar(dto: CreateItemPedidoDto): Promise<ItemPedido> {
    const negocioId = this.getNegocioId();
    const existente = await this.repository.findOne({
      where: {
        negocioId,
        productoId: dto.productoId,
        estado: EstadoItemPedido.PENDIENTE,
      },
    });
    if (existente) return existente;

    const producto = await this.productosRepository.findOne({
      where: { id: dto.productoId, negocioId },
    });
    if (!producto) {
      throw new NotFoundException(
        `Producto con ID ${dto.productoId} no encontrado`,
      );
    }

    return this.createForTenant({
      productoId: producto.id,
      nombreProducto: producto.nombre,
      agregadoPor: this.cls.get<string>('usuarioId'),
    });
  }

  /** Paso "Realizar pedido": fija proveedor, costo y cantidad, y pasa el ítem a PEDIDO. */
  async realizarPedido(
    id: string,
    dto: RealizarPedidoDto,
  ): Promise<ItemPedido> {
    const item = await this.findOneForTenant(id);
    if (item.estado !== EstadoItemPedido.PENDIENTE) {
      throw new BadRequestException(
        'Solo se puede realizar el pedido de un ítem pendiente',
      );
    }

    const vinculo = await this.proveedoresService.vincularProducto(
      item.productoId,
      {
        proveedorId: dto.proveedorId,
        proveedorNuevo: dto.proveedorNuevo,
        costo: dto.costoUnitario,
      },
    );
    const proveedor = await this.proveedoresService.findOne(
      vinculo.proveedorId,
    );

    return this.updateForTenant(id, {
      estado: EstadoItemPedido.PEDIDO,
      proveedorId: proveedor.id,
      nombreProveedor: proveedor.nombre,
      costoUnitario: dto.costoUnitario,
      cantidad: dto.cantidad,
      fechaPedido: new Date(),
      pedidoPor: this.cls.get<string>('usuarioId'),
    });
  }

  /**
   * Paso "Confirmar ingreso": mueve stock a la bodega elegida, actualiza el
   * costo del producto (y el precio de venta si el frontend ya resolvió que
   * corresponde), y cierra el ítem como INGRESADO.
   */
  async confirmarIngreso(
    id: string,
    dto: ConfirmarIngresoDto,
  ): Promise<ItemPedido> {
    const item = await this.findOneForTenant(id);
    if (item.estado !== EstadoItemPedido.PEDIDO) {
      throw new BadRequestException(
        'Solo se puede confirmar el ingreso de un ítem con pedido realizado',
      );
    }
    if (!item.costoUnitario || !item.cantidad) {
      throw new BadRequestException(
        'El ítem no tiene costo o cantidad — esto no debería pasar',
      );
    }

    await this.inventarioService.ajustarStock({
      productoId: item.productoId,
      bodegaId: dto.bodegaId,
      tipo: TipoMovimientoInventario.ENTRADA,
      cantidad: Number(item.cantidad),
      motivo: 'Ingreso de pedido a proveedor',
    });

    const producto = await this.productosRepository.findOne({
      where: { id: item.productoId, negocioId: this.getNegocioId() },
    });
    if (producto) {
      producto.costo = item.costoUnitario;
      if (dto.nuevoPrecioVenta !== undefined) {
        producto.precioVenta = dto.nuevoPrecioVenta;
      }
      await this.productosRepository.save(producto);
    }

    return this.updateForTenant(id, {
      estado: EstadoItemPedido.INGRESADO,
      fechaIngreso: new Date(),
      ingresadoPor: this.cls.get<string>('usuarioId'),
    });
  }

  async remove(id: string): Promise<void> {
    const item = await this.findOneForTenant(id);
    if (item.estado === EstadoItemPedido.INGRESADO) {
      throw new BadRequestException(
        'No se puede quitar un ítem ya ingresado — es historial',
      );
    }
    await this.repository.remove(item);
  }
}
