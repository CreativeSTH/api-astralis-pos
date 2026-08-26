import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TiendaOnline } from './entities/tienda-online.entity';
import { Bodega } from '../bodegas/entities/bodega.entity';
import { TiendaOnlineService } from './tienda-online.service';
import { TiendaOnlineController } from './tienda-online.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TiendaOnline, Bodega])],
  controllers: [TiendaOnlineController],
  providers: [TiendaOnlineService],
  exports: [TiendaOnlineService],
})
export class TiendaOnlineModule {}
