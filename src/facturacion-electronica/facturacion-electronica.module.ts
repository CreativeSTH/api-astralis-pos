import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturacionElectronicaService } from './facturacion-electronica.service';
import { FacturacionElectronicaController } from './facturacion-electronica.controller';
import { AlegraClientService } from './alegra-client.service';
import { HabilitacionFacturacionElectronica } from './entities/habilitacion-facturacion-electronica.entity';
import { DocumentoElectronico } from './entities/documento-electronico.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([HabilitacionFacturacionElectronica, DocumentoElectronico, Negocio]),
    SuscripcionesModule,
  ],
  controllers: [FacturacionElectronicaController],
  providers: [FacturacionElectronicaService, AlegraClientService],
  exports: [FacturacionElectronicaService],
})
export class FacturacionElectronicaModule {}
