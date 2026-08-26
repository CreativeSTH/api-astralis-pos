import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inventario } from '../inventario/entities/inventario.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { TiendaOnlineModule } from '../tienda-online/tienda-online.module';
import { CatalogoPublicoService } from './catalogo-publico.service';
import { CatalogoPublicoController } from './catalogo-publico.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Inventario, Negocio]), TiendaOnlineModule],
  controllers: [CatalogoPublicoController],
  providers: [CatalogoPublicoService],
})
export class CatalogoClienteModule {}
