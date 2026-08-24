import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CuponesService } from './cupones.service';
import { CuponesController } from './cupones.controller';
import { PromocionesPricingService } from './promociones-pricing.service';
import { CuponValidacionService } from './cupon-validacion.service';
import { Promocion } from './entities/promocion.entity';
import { PromocionUso } from './entities/promocion-uso.entity';
import { Producto } from '../productos/entities/producto.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Promocion, PromocionUso, Producto])],
  controllers: [CuponesController],
  providers: [CuponesService, PromocionesPricingService, CuponValidacionService],
  exports: [PromocionesPricingService, CuponValidacionService],
})
export class CuponesModule {}
