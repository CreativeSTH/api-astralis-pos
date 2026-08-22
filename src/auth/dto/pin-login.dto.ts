import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class PinLoginDto {
  @ApiProperty({ example: '1234' })
  @Matches(/^\d{4,6}$/, {
    message: 'El PIN debe tener entre 4 y 6 dígitos numéricos',
  })
  pin: string;
}
