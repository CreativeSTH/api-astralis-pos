import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertasService } from './alertas.service';
import { AlertasCronService } from './alertas-cron.service';
import { AlertasController } from './alertas.controller';
import { Alerta } from './entities/alerta.entity';
import { ReglaAlerta } from './entities/regla-alerta.entity';
import { Cuota } from '../ventas/entities/cuota.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { ItemPedido } from '../lista-pedidos/entities/item-pedido.entity';
import { TurnoCaja } from '../caja/entities/turno-caja.entity';
import { NegociosModule } from '../negocios/negocios.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Alerta,
      ReglaAlerta,
      Cuota,
      Venta,
      Cliente,
      Inventario,
      Sucursal,
      ItemPedido,
      TurnoCaja,
    ]),
    NegociosModule,
    RealtimeModule,
  ],
  controllers: [AlertasController],
  providers: [AlertasService, AlertasCronService],
  exports: [AlertasService],
})
export class AlertasModule {}
