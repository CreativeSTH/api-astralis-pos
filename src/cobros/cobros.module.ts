import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CobrosService } from './cobros.service';
import { CobrosController } from './cobros.controller';
import { Cuota } from '../ventas/entities/cuota.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Cuota])],
  controllers: [CobrosController],
  providers: [CobrosService],
})
export class CobrosModule {}
