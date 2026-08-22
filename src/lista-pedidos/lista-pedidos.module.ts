import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListaPedidosService } from './lista-pedidos.service';
import { ListaPedidosController } from './lista-pedidos.controller';
import { ItemPedido } from './entities/item-pedido.entity';
import { Producto } from '../productos/entities/producto.entity';
import { InventarioModule } from '../inventario/inventario.module';
import { ProveedoresModule } from '../proveedores/proveedores.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ItemPedido, Producto]),
    InventarioModule,
    ProveedoresModule,
  ],
  controllers: [ListaPedidosController],
  providers: [ListaPedidosService],
})
export class ListaPedidosModule {}
