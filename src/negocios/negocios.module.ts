import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NegociosService } from './negocios.service';
import { NegociosController } from './negocios.controller';
import { Negocio } from './entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { RolesModule } from '../roles/roles.module';
import { MetodosPagoModule } from '../metodos-pago/metodos-pago.module';
import { PaquetesModule } from '../paquetes/paquetes.module';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Negocio, Usuario]),
    RolesModule,
    MetodosPagoModule,
    PaquetesModule,
    SuscripcionesModule,
    EmailModule,
  ],
  controllers: [NegociosController],
  providers: [NegociosService],
  exports: [NegociosService],
})
export class NegociosModule {}
