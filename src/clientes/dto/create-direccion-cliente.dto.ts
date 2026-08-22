import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateDireccionClienteDto {
  @ApiProperty({ required: false, description: 'Ej. "Casa", "Trabajo"' })
  @IsOptional()
  @IsString()
  etiqueta?: string;

  @ApiProperty()
  @IsString()
  direccionLinea1: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  direccionLinea2?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  barrio?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  puntoReferencia?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telefonoContacto?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  predeterminada?: boolean;
}
