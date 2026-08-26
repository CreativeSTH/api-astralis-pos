import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LoginClienteDto {
  @ApiProperty()
  @IsString()
  telefono: string;

  @ApiProperty()
  @IsString()
  password: string;
}
