import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VentasService } from './ventas.service';
import { ComprobantesService } from './comprobantes.service';
import { VentasController } from './ventas.controller';
import { Venta } from './entities/venta.entity';
import { VentaItem } from './entities/venta-item.entity';
import { VentaPago } from './entities/venta-pago.entity';
import { Cuota } from './entities/cuota.entity';
import { RegistroPagoCuota } from './entities/registro-pago-cuota.entity';
import { CajaModule } from '../caja/caja.module';
import { ClientesModule } from '../clientes/clientes.module';
import { AuthModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { AlertasModule } from '../alertas/alertas.module';
import { Inventario } from '../inventario/entities/inventario.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { MetodosPagoModule } from '../metodos-pago/metodos-pago.module';
import { FacturacionModule } from '../facturacion/facturacion.module';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { PlantillaComprobante } from '../facturacion/entities/plantilla-comprobante.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Venta,
      VentaItem,
      VentaPago,
      Cuota,
      RegistroPagoCuota,
      Inventario,
      Sucursal,
      Negocio,
      PlantillaComprobante,
    ]),
    CajaModule,
    ClientesModule,
    AuthModule,
    RolesModule,
    AlertasModule,
    RealtimeModule,
    MetodosPagoModule,
    FacturacionModule,
  ],
  controllers: [VentasController],
  providers: [VentasService, ComprobantesService],
  exports: [VentasService],
})
export class VentasModule {}
