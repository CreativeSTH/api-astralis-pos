import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Inventario } from '../inventario/entities/inventario.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { DireccionCliente } from '../clientes/entities/direccion-cliente.entity';
import { TiendaOnlineModule } from '../tienda-online/tienda-online.module';
import { CatalogoPublicoService } from './catalogo-publico.service';
import { CatalogoPublicoController } from './catalogo-publico.controller';
import { ClienteAuthService } from './cliente-auth.service';
import { ClienteAuthController } from './cliente-auth.controller';
import { ClientePerfilService } from './cliente-perfil.service';
import { ClientePerfilController } from './cliente-perfil.controller';
import { JwtClienteStrategy } from './strategies/jwt-cliente.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inventario, Negocio, Cliente, DireccionCliente]),
    TiendaOnlineModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>(
          'JWT_CLIENTE_SECRET',
          'dev-secret-cliente-cambiar-en-produccion',
        ),
        signOptions: {
          expiresIn: configService.get<string>('JWT_CLIENTE_EXPIRES_IN', '30d') as unknown as number,
        },
      }),
    }),
  ],
  controllers: [CatalogoPublicoController, ClienteAuthController, ClientePerfilController],
  providers: [CatalogoPublicoService, ClienteAuthService, ClientePerfilService, JwtClienteStrategy],
  exports: [JwtModule, PassportModule],
})
export class CatalogoClienteModule {}
