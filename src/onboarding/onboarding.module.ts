import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { HabilitacionFacturacionElectronica } from '../facturacion-electronica/entities/habilitacion-facturacion-electronica.entity';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sucursal, Venta, HabilitacionFacturacionElectronica]),
    SuscripcionesModule,
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
