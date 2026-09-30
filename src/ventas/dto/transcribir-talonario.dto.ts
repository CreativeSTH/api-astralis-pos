import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, Min, ValidateNested } from 'class-validator';
import { CreateVentaDto } from './create-venta.dto';

export class FacturaTalonarioDto {
  @ApiProperty({ description: 'Número de la factura de papel (sin prefijo), dentro del rango de contingencia' })
  @IsInt()
  @Min(1)
  numero: number;

  @ApiProperty({ description: 'Fecha y hora escritas en la factura de papel (ISO)' })
  @IsDateString()
  fecha: string;
}

/** Fase 6a: una venta ya facturada a mano en un talonario de papel durante una contingencia. */
export class TranscribirTalonarioDto {
  @ApiProperty({ type: CreateVentaDto })
  @ValidateNested()
  @Type(() => CreateVentaDto)
  venta: CreateVentaDto;

  @ApiProperty({ type: FacturaTalonarioDto })
  @ValidateNested()
  @Type(() => FacturaTalonarioDto)
  talonario: FacturaTalonarioDto;
}
