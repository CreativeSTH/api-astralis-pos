import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

class AdminInicialDto {
  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password: string;
}

export class CreateNegocioDto {
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
  tipoNegocio?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiProperty({
    description: 'Usuario ADMIN_NEGOCIO creado junto con el negocio',
  })
  @ValidateNested()
  @Type(() => AdminInicialDto)
  adminInicial: AdminInicialDto;
}
