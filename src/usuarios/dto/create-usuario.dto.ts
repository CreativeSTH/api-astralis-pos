import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateUsuarioDto {
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

  @ApiProperty({
    required: false,
    description: 'PIN de 4 a 6 dígitos para cambio rápido de cajero',
  })
  @IsOptional()
  @Matches(/^\d{4,6}$/, {
    message: 'El PIN debe tener entre 4 y 6 dígitos numéricos',
  })
  pin?: string;

  @ApiProperty({ description: 'ID de un Rol del propio negocio' })
  @IsUUID()
  rolId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  sucursalId?: string;
}
