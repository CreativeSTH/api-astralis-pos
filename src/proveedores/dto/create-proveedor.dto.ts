import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateProveedorDto {
  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nit?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  contactoNombre?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rutNumero?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  camaraComercioNumero?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  certificacionBancariaInfo?: string;
}
