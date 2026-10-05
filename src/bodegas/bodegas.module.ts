import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BodegasService } from './bodegas.service';
import { BodegasController } from './bodegas.controller';
import { Bodega } from './entities/bodega.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Traslado } from '../traslados/entities/traslado.entity';
import { TiendaOnlineModule } from '../tienda-online/tienda-online.module';

@Module({
  imports: [TypeOrmModule.forFeature([Bodega, Sucursal, Traslado]), TiendaOnlineModule],
  controllers: [BodegasController],
  providers: [BodegasService],
  exports: [BodegasService],
})
export class BodegasModule {}
