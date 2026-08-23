import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CajaService } from './caja.service';
import { CajaController } from './caja.controller';
import { TurnoCaja } from './entities/turno-caja.entity';
import { MovimientoCaja } from './entities/movimiento-caja.entity';
import { MetodosPagoModule } from '../metodos-pago/metodos-pago.module';

@Module({
  imports: [TypeOrmModule.forFeature([TurnoCaja, MovimientoCaja]), MetodosPagoModule],
  controllers: [CajaController],
  providers: [CajaService],
  exports: [CajaService],
})
export class CajaModule {}
