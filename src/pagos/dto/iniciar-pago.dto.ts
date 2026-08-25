import { IsIn, IsInt, IsObject, IsPositive } from 'class-validator';
import type { MetodoPagoWompi } from '../entities/transaccion-pago.entity';

export class IniciarPagoDto {
  @IsInt()
  @IsPositive()
  montoEnCentavos: number;

  @IsIn(['QR', 'NEQUI', 'PSE', 'TARJETA'])
  metodo: MetodoPagoWompi;

  @IsObject()
  datosMetodo: Record<string, unknown>;
}
