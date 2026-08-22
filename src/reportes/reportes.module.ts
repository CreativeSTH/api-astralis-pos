import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportesService } from './reportes.service';
import { ReportesController } from './reportes.controller';
import { Venta } from '../ventas/entities/venta.entity';
import { VentaPago } from '../ventas/entities/venta-pago.entity';
import { TurnoCaja } from '../caja/entities/turno-caja.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Venta, VentaPago, TurnoCaja])],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
