import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NumeracionComprobanteService } from './numeracion-comprobante.service';
import { NumeracionComprobante } from './entities/numeracion-comprobante.entity';
import { FacturacionController } from './facturacion.controller';
import { ComprobantesListadoService } from './comprobantes-listado.service';
import { FormatoImpresionService } from './formato-impresion.service';
import { Negocio } from '../negocios/entities/negocio.entity';

@Module({
  imports: [TypeOrmModule.forFeature([NumeracionComprobante, Negocio])],
  controllers: [FacturacionController],
  providers: [NumeracionComprobanteService, ComprobantesListadoService, FormatoImpresionService],
  exports: [NumeracionComprobanteService],
})
export class FacturacionModule {}
