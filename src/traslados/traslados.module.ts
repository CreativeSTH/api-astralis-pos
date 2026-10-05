import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Traslado } from './entities/traslado.entity';
import { TrasladoItem } from './entities/traslado-item.entity';
import { TrasladosService } from './traslados.service';
import { TrasladosController } from './traslados.controller';
import { AlertasModule } from '../alertas/alertas.module';

/** PermisosService llega por RolesModule (@Global), AuditoriaService por AuditoriaModule (@Global). */
@Module({
  imports: [TypeOrmModule.forFeature([Traslado, TrasladoItem]), AlertasModule],
  controllers: [TrasladosController],
  providers: [TrasladosService],
})
export class TrasladosModule {}
