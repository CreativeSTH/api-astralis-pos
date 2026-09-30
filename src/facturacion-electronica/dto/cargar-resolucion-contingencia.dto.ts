import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsString, Matches, Min } from 'class-validator';

/** Resolución de numeración tipo "Factura de talonario o de papel" (fase 6a — contingencia). */
export class CargarResolucionContingenciaDto {
  @ApiProperty({ description: 'Número de la resolución de numeración tipo "Factura de talonario o de papel"' })
  @IsString()
  @Matches(/^\d{1,14}$/, { message: 'El número de resolución solo lleva dígitos (máximo 14)' })
  numero: string;

  @ApiProperty({ description: 'Prefijo de contingencia, distinto al de la factura electrónica' })
  @Matches(/^[A-Za-z0-9]{1,4}$/, { message: 'El prefijo tiene de 1 a 4 letras o números' })
  prefijo: string;

  @ApiProperty()
  @IsDateString()
  fechaInicio: string;

  @ApiProperty()
  @IsDateString()
  fechaFin: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  rangoDesde: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  rangoHasta: number;
}
