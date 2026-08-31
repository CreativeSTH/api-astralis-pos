import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';
import type { MetodoPagoSuscripcion } from '../entities/transaccion-suscripcion.entity';

export class ReactivarSuscripcionDto {
  @ApiProperty({ required: false, description: 'Si se omite, reactiva con el paquete actual' })
  @IsOptional()
  @IsUUID()
  paqueteId?: string;

  @ApiProperty({ enum: ['QR', 'NEQUI', 'PSE', 'TARJETA'] })
  @IsIn(['QR', 'NEQUI', 'PSE', 'TARJETA'])
  metodo: MetodoPagoSuscripcion;

  @ApiProperty()
  @IsObject()
  datosMetodo: Record<string, unknown>;
}
