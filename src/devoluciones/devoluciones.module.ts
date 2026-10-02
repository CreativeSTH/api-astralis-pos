import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevolucionesService } from './devoluciones.service';
import { DevolucionesController } from './devoluciones.controller';
import { Devolucion } from './entities/devolucion.entity';
import { DevolucionItem } from './entities/devolucion-item.entity';
import { DevolucionReembolso } from './entities/devolucion-reembolso.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { VentaItem } from '../ventas/entities/venta-item.entity';
import { Cuota } from '../ventas/entities/cuota.entity';
import { Inventario } from '../inventario/entities/inventario.entity';
import { MovimientoInventario } from '../inventario/entities/movimiento-inventario.entity';
import { MovimientoCaja } from '../caja/entities/movimiento-caja.entity';
import { TurnoCaja } from '../caja/entities/turno-caja.entity';
import { Cliente } from '../clientes/entities/cliente.entity';
import { MovimientoSaldoCliente } from '../clientes/entities/movimiento-saldo-cliente.entity';
import { DocumentoElectronico } from '../facturacion-electronica/entities/documento-electronico.entity';
import { CajaModule } from '../caja/caja.module';
import { AuthModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MetodosPagoModule } from '../metodos-pago/metodos-pago.module';
import { FacturacionModule } from '../facturacion/facturacion.module';
import { FacturacionElectronicaModule } from '../facturacion-electronica/facturacion-electronica.module';
import { VentasModule } from '../ventas/ventas.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Devolucion,
      DevolucionItem,
      DevolucionReembolso,
      Venta,
      VentaItem,
      Cuota,
      Inventario,
      MovimientoInventario,
      MovimientoCaja,
      TurnoCaja,
      Cliente,
      MovimientoSaldoCliente,
      DocumentoElectronico,
    ]),
    CajaModule,
    AuthModule,
    RolesModule,
    RealtimeModule,
    MetodosPagoModule,
    FacturacionModule,
    FacturacionElectronicaModule,
    VentasModule,
  ],
  controllers: [DevolucionesController],
  providers: [DevolucionesService],
  exports: [DevolucionesService],
})
export class DevolucionesModule {}
