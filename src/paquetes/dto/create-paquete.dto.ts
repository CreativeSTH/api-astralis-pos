import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePaqueteDto {
  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  precioMensual: number;

  @ApiProperty()
  @IsBoolean()
  facturacionDianHabilitada: boolean;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  documentosDianPorMes: number;

  @ApiProperty()
  @IsBoolean()
  tiendaOnlineHabilitada: boolean;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  maxSucursales: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  maxUsuarios: number;
}
