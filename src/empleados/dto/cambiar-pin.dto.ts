import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class CambiarPinDto {
  @ApiProperty({ description: 'PIN de marcación, 4 a 6 dígitos' })
  @Matches(/^\d{4,6}$/, { message: 'El PIN debe tener entre 4 y 6 dígitos' })
  pin: string;
}
