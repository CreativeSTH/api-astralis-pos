import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RegistroClienteDto {
  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty()
  @IsString()
  telefono: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password: string;
}
