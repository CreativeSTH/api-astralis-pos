import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlantillasComprobanteService } from './plantillas-comprobante.service';
import { PlantillasComprobanteController } from './plantillas-comprobante.controller';
import { NumeracionComprobanteService } from './numeracion-comprobante.service';
import { PlantillaComprobante } from './entities/plantilla-comprobante.entity';
import { NumeracionComprobante } from './entities/numeracion-comprobante.entity';
import { FacturacionController } from './facturacion.controller';
import { ComprobantesListadoService } from './comprobantes-listado.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlantillaComprobante, NumeracionComprobante])],
  controllers: [PlantillasComprobanteController, FacturacionController],
  providers: [PlantillasComprobanteService, NumeracionComprobanteService, ComprobantesListadoService],
  exports: [PlantillasComprobanteService, NumeracionComprobanteService],
})
export class FacturacionModule {}
