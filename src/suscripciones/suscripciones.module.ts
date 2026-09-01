import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuscripcionesService } from './suscripciones.service';
import { SuscripcionesController } from './suscripciones.controller';
import { SuscripcionesCronService } from './suscripciones-cron.service';
import { Suscripcion } from './entities/suscripcion.entity';
import { TransaccionSuscripcion } from './entities/transaccion-suscripcion.entity';
import { MedioPagoGuardado } from './entities/medio-pago-guardado.entity';
import { WompiClientService } from '../pagos/wompi-client.service';
import { PaquetesModule } from '../paquetes/paquetes.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [TypeOrmModule.forFeature([Suscripcion, TransaccionSuscripcion, MedioPagoGuardado]), PaquetesModule, RealtimeModule],
  controllers: [SuscripcionesController],
  providers: [SuscripcionesService, WompiClientService, SuscripcionesCronService],
  exports: [SuscripcionesService],
})
export class SuscripcionesModule {}
