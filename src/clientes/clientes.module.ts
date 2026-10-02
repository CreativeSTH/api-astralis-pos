import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientesService } from './clientes.service';
import { ClientesController } from './clientes.controller';
import { Cliente } from './entities/cliente.entity';
import { NotaCliente } from './entities/nota-cliente.entity';
import { DireccionCliente } from './entities/direccion-cliente.entity';
import { MovimientoSaldoCliente } from './entities/movimiento-saldo-cliente.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente, NotaCliente, DireccionCliente, MovimientoSaldoCliente])],
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
