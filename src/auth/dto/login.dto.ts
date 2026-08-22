import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@mitienda.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'contraseña-segura' })
  @IsString()
  @MinLength(6)
  password: string;
}
