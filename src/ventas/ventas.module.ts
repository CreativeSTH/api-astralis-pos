import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VentasService } from './ventas.service';
import { VentasController } from './ventas.controller';
import { Venta } from './entities/venta.entity';
import { VentaItem } from './entities/venta-item.entity';
import { VentaPago } from './entities/venta-pago.entity';
import { Cuota } from './entities/cuota.entity';
import { RegistroPagoCuota } from './entities/registro-pago-cuota.entity';
import { CajaModule } from '../caja/caja.module';
import { ClientesModule } from '../clientes/clientes.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Venta,
      VentaItem,
      VentaPago,
      Cuota,
      RegistroPagoCuota,
    ]),
    CajaModule,
    ClientesModule,
    AuthModule,
  ],
  controllers: [VentasController],
  providers: [VentasService],
  exports: [VentasService],
})
export class VentasModule {}
