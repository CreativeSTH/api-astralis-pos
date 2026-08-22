import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertasService } from './alertas.service';
import { AlertasCronService } from './alertas-cron.service';
import { AlertasController } from './alertas.controller';
import { Alerta } from './entities/alerta.entity';
import { Cuota } from '../ventas/entities/cuota.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
import { NegociosModule } from '../negocios/negocios.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Alerta, Cuota, Venta, Cliente, Inventario]),
    NegociosModule,
  ],
  controllers: [AlertasController],
  providers: [AlertasService, AlertasCronService],
})
export class AlertasModule {}
