import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Negocio } from '../negocios/entities/negocio.entity';
import { HabilitacionFacturacionElectronica } from '../facturacion-electronica/entities/habilitacion-facturacion-electronica.entity';
import { PoliticaFacturacionService } from './politica-facturacion.service';
import { PoliticaFacturacionController } from './politica-facturacion.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Negocio, HabilitacionFacturacionElectronica])],
  controllers: [PoliticaFacturacionController],
  providers: [PoliticaFacturacionService],
  exports: [PoliticaFacturacionService],
})
export class PoliticaFacturacionModule {}
