import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString } from 'class-validator';

export class CargarResolucionDto {
  @ApiProperty()
  @IsString()
  numero: string;

  @ApiProperty()
  @IsString()
  prefijo: string;

  @ApiProperty()
  @IsString()
  fechaInicio: string;

  @ApiProperty()
  @IsString()
  fechaFin: string;

  @ApiProperty()
  @IsInt()
  rangoDesde: number;

  @ApiProperty()
  @IsInt()
  rangoHasta: number;

  @ApiProperty()
  @IsString()
  technicalKey: string;
}
