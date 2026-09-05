import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { ScheduleModule } from '@nestjs/schedule';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { SuscripcionGuard } from './common/guards/suscripcion.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

import { AuthModule } from './auth/auth.module';
import { RolesModule } from './roles/roles.module';
import { NegociosModule } from './negocios/negocios.module';
import { SucursalesModule } from './sucursales/sucursales.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { CategoriasModule } from './categorias/categorias.module';
import { MarcasModule } from './marcas/marcas.module';
import { LineasModule } from './lineas/lineas.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { ClientesModule } from './clientes/clientes.module';
import { DomiciliosModule } from './domicilios/domicilios.module';
import { ProductosModule } from './productos/productos.module';
import { BodegasModule } from './bodegas/bodegas.module';
import { InventarioModule } from './inventario/inventario.module';
import { CajaModule } from './caja/caja.module';
import { VentasModule } from './ventas/ventas.module';
import { MetodosPagoModule } from './metodos-pago/metodos-pago.module';
import { CobrosModule } from './cobros/cobros.module';
import { AlertasModule } from './alertas/alertas.module';
import { ListaPedidosModule } from './lista-pedidos/lista-pedidos.module';
import { ReportesModule } from './reportes/reportes.module';
import { GraficosModule } from './graficos/graficos.module';
import { FacturacionModule } from './facturacion/facturacion.module';
import { CuponesModule } from './cupones/cupones.module';
import { HealthModule } from './health/health.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PagosModule } from './pagos/pagos.module';
import { TiendaOnlineModule } from './tienda-online/tienda-online.module';
import { CatalogoClienteModule } from './catalogo-cliente/catalogo-cliente.module';
import { PaquetesModule } from './paquetes/paquetes.module';
import { SuscripcionesModule } from './suscripciones/suscripciones.module';
import { FacturacionElectronicaModule } from './facturacion-electronica/facturacion-electronica.module';
import { OnboardingModule } from './onboarding/onboarding.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 10000, limit: 50 },
      { name: 'long', ttl: 60000, limit: 200 },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'pos_user'),
        password: config.get<string>('DB_PASSWORD', 'pos_password'),
        database: config.get<string>('DB_NAME', 'pos_db'),
        autoLoadEntities: true,
        synchronize:
          config.get<string>('NODE_ENV', 'development') !== 'production',
      }),
    }),

    AuthModule,
    RolesModule,
    NegociosModule,
    SucursalesModule,
    UsuariosModule,
    CategoriasModule,
    MarcasModule,
    LineasModule,
    ProveedoresModule,
    ClientesModule,
    DomiciliosModule,
    ProductosModule,
    BodegasModule,
    InventarioModule,
    CajaModule,
    VentasModule,
    MetodosPagoModule,
    CobrosModule,
    AlertasModule,
    ListaPedidosModule,
    ReportesModule,
    GraficosModule,
    FacturacionModule,
    CuponesModule,
    HealthModule,
    RealtimeModule,
    PagosModule,
    TiendaOnlineModule,
    CatalogoClienteModule,
    PaquetesModule,
    SuscripcionesModule,
    FacturacionElectronicaModule,
    OnboardingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: SuscripcionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
