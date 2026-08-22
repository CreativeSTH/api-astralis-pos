import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListaPedidosService } from './lista-pedidos.service';
import { ListaPedidosController } from './lista-pedidos.controller';
import { ItemPedido } from './entities/item-pedido.entity';
import { Producto } from '../productos/entities/producto.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ItemPedido, Producto])],
  controllers: [ListaPedidosController],
  providers: [ListaPedidosService],
})
export class ListaPedidosModule {}
