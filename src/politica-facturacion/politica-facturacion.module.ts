import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Negocio } from '../negocios/entities/negocio.entity';
import { HabilitacionFacturacionElectronica } from '../facturacion-electronica/entities/habilitacion-facturacion-electronica.entity';
import { PeriodoContingencia } from '../facturacion-electronica/entities/periodo-contingencia.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { Alerta } from '../alertas/entities/alerta.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { EmailModule } from '../email/email.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PoliticaFacturacionService } from './politica-facturacion.service';
import { PoliticaFacturacionController } from './politica-facturacion.controller';
import { TopeUvtService } from './tope-uvt.service';
import { TopeUvtCronService } from './tope-uvt-cron.service';

@Module({
  imports: [
    // Repositorios directos (no los módulos de ventas/alertas/usuarios): VentasModule importa este módulo.
    TypeOrmModule.forFeature([
      Negocio,
      HabilitacionFacturacionElectronica,
      PeriodoContingencia,
      Venta,
      Alerta,
      Usuario,
    ]),
    EmailModule,
    RealtimeModule,
  ],
  controllers: [PoliticaFacturacionController],
  providers: [PoliticaFacturacionService, TopeUvtService, TopeUvtCronService],
  exports: [PoliticaFacturacionService],
})
export class PoliticaFacturacionModule {}
