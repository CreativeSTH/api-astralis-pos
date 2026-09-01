import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuscripcionesService } from './suscripciones.service';
import { SuscripcionesController } from './suscripciones.controller';
import { SuscripcionesCronService } from './suscripciones-cron.service';
import { Suscripcion } from './entities/suscripcion.entity';
import { TransaccionSuscripcion } from './entities/transaccion-suscripcion.entity';
import { MedioPagoGuardado } from './entities/medio-pago-guardado.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Alerta } from '../alertas/entities/alerta.entity';
import { WompiClientService } from '../pagos/wompi-client.service';
import { PaquetesModule } from '../paquetes/paquetes.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Suscripcion, TransaccionSuscripcion, MedioPagoGuardado, Negocio, Usuario, Alerta]),
    PaquetesModule,
    RealtimeModule,
    EmailModule,
  ],
  controllers: [SuscripcionesController],
  providers: [SuscripcionesService, WompiClientService, SuscripcionesCronService],
  exports: [SuscripcionesService],
})
export class SuscripcionesModule {}
