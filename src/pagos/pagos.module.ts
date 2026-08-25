import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionPagoWompi } from './entities/configuracion-pago-wompi.entity';
import { TransaccionPago } from './entities/transaccion-pago.entity';
import { PagosService } from './pagos.service';
import { PagosController } from './pagos.controller';
import { PagosCronService } from './pagos-cron.service';
import { WompiClientService } from './wompi-client.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { MetodosPagoModule } from '../metodos-pago/metodos-pago.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConfiguracionPagoWompi, TransaccionPago]),
    RealtimeModule,
    MetodosPagoModule,
  ],
  controllers: [PagosController],
  providers: [PagosService, WompiClientService, PagosCronService],
})
export class PagosModule {}
