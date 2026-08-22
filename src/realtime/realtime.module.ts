import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Registra su propio JwtModule (mismo factory que AuthModule, ver
 * src/auth/auth.module.ts) en vez de importar AuthModule, para no crear una
 * dependencia circular — el gateway solo necesita poder *verificar* tokens,
 * no el resto de la lógica de auth.
 *
 * Nota de escala: las salas de Socket.IO viven en memoria de este proceso.
 * Con una sola instancia de backend (caso actual) funciona solo. Si el día
 * de mañana el backend corre en más de una instancia detrás de un balanceador,
 * hace falta un adapter compartido (ej. @socket.io/redis-adapter) para que
 * las salas funcionen entre instancias — no se monta ahora porque no hace
 * falta a esta escala.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>(
          'JWT_SECRET',
          'dev-secret-cambiar-en-produccion',
        ),
      }),
    }),
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
