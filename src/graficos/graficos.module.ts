import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraficosService } from './graficos.service';
import { GraficosDataService } from './graficos-data.service';
import { GraficosController } from './graficos.controller';
import { GraficoConfigurado } from './entities/grafico-configurado.entity';
import { LayoutGraficos } from './entities/layout-graficos.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { VentaPago } from '../ventas/entities/venta-pago.entity';
import { MovimientoCaja } from '../caja/entities/movimiento-caja.entity';
import { TurnoCaja } from '../caja/entities/turno-caja.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([GraficoConfigurado, LayoutGraficos, Venta, VentaPago, MovimientoCaja, TurnoCaja]),
  ],
  controllers: [GraficosController],
  providers: [GraficosService, GraficosDataService],
})
export class GraficosModule {}
