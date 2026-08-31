import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
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

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  guardarTarjeta?: boolean;

  @ApiProperty({ required: false, description: 'Requerido si guardarTarjeta=true y metodo=TARJETA' })
  @IsOptional()
  @IsString()
  ultimosCuatroDigitos?: string;
}
