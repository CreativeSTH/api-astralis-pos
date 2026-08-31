import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ReenviarVerificacionDto {
  @ApiProperty()
  @IsEmail()
  email: string;
}
