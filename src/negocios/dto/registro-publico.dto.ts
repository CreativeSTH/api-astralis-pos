import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegistroPublicoDto {
  @ApiProperty()
  @IsString()
  nombreNegocio: string;

  @ApiProperty()
  @IsString()
  adminNombre: string;

  @ApiProperty()
  @IsEmail()
  adminEmail: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  adminPassword: string;
}
