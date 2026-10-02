import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturacionElectronicaService } from './facturacion-electronica.service';
import { FacturacionElectronicaController } from './facturacion-electronica.controller';
import { FacturacionElectronicaCronService } from './facturacion-electronica-cron.service';
import { AlegraClientService } from './alegra-client.service';
import { FacturaPdfService } from './factura-pdf.service';
import { LogoNegocioService } from './logo-negocio.service';
import { ContingenciaService } from './contingencia.service';
import { ContingenciaController } from './contingencia.controller';
import { CartaContingenciaPdfService } from './carta-contingencia-pdf.service';
import { HabilitacionFacturacionElectronica } from './entities/habilitacion-facturacion-electronica.entity';
import { DocumentoElectronico } from './entities/documento-electronico.entity';
import { PeriodoContingencia } from './entities/periodo-contingencia.entity';
import { ReservaContingencia } from './entities/reserva-contingencia.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Alerta } from '../alertas/entities/alerta.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { TiendaOnline } from '../tienda-online/entities/tienda-online.entity';
import { Devolucion } from '../devoluciones/entities/devolucion.entity';
import { DevolucionItem } from '../devoluciones/entities/devolucion-item.entity';
import { DevolucionReembolso } from '../devoluciones/entities/devolucion-reembolso.entity';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HabilitacionFacturacionElectronica,
      DocumentoElectronico,
      PeriodoContingencia,
      ReservaContingencia,
      Negocio,
      Alerta,
      Venta,
      TiendaOnline,
      Devolucion,
      DevolucionItem,
      DevolucionReembolso,
    ]),
    SuscripcionesModule,
    RealtimeModule,
    EmailModule,
  ],
  controllers: [FacturacionElectronicaController, ContingenciaController],
  providers: [
    FacturacionElectronicaService,
    AlegraClientService,
    FacturacionElectronicaCronService,
    FacturaPdfService,
    LogoNegocioService,
    ContingenciaService,
    CartaContingenciaPdfService,
  ],
  exports: [FacturacionElectronicaService, FacturaPdfService, ContingenciaService],
})
export class FacturacionElectronicaModule {}
