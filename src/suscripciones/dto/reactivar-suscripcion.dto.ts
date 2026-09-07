import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, Matches, IsUUID } from 'class-validator';
import type { MetodoPagoSuscripcion } from '../entities/transaccion-suscripcion.entity';
import { CicloFacturacion } from '../entities/ciclo-facturacion.enum';

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
  @Matches(/^\d{4}$/, { message: 'ultimosCuatroDigitos debe ser exactamente 4 dígitos' })
  ultimosCuatroDigitos?: string;

  @ApiProperty({ enum: CicloFacturacion, required: false, default: CicloFacturacion.MENSUAL })
  @IsOptional()
  @IsIn(Object.values(CicloFacturacion))
  cicloFacturacion?: CicloFacturacion;
}
