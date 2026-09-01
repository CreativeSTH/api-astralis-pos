import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturacionElectronicaService } from './facturacion-electronica.service';
import { FacturacionElectronicaController } from './facturacion-electronica.controller';
import { FacturacionElectronicaCronService } from './facturacion-electronica-cron.service';
import { AlegraClientService } from './alegra-client.service';
import { HabilitacionFacturacionElectronica } from './entities/habilitacion-facturacion-electronica.entity';
import { DocumentoElectronico } from './entities/documento-electronico.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Alerta } from '../alertas/entities/alerta.entity';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([HabilitacionFacturacionElectronica, DocumentoElectronico, Negocio, Alerta]),
    SuscripcionesModule,
    RealtimeModule,
  ],
  controllers: [FacturacionElectronicaController],
  providers: [FacturacionElectronicaService, AlegraClientService, FacturacionElectronicaCronService],
  exports: [FacturacionElectronicaService],
})
export class FacturacionElectronicaModule {}
