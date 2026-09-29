import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TIPOS_DOCUMENTO_IDENTIDAD } from '../tipo-documento-identidad';

export class CreateClienteDto {
  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty()
  @IsString()
  telefono: string;

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
  documentoIdentidad?: string;

  @ApiProperty({ required: false, enum: TIPOS_DOCUMENTO_IDENTIDAD, description: 'Catálogo DIAN: 13 CC, 31 NIT, 22 CE, 41 Pasaporte, 12 TI, 47 PEP, 48 PPT' })
  @IsOptional()
  @IsIn(TIPOS_DOCUMENTO_IDENTIDAD)
  tipoDocumentoIdentidad?: string;

  @ApiProperty({ default: 0, description: '0 = el cliente no maneja crédito' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  limiteCredito?: number;
}
