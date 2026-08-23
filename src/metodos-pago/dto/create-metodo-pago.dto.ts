import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateMetodoPagoDto {
  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Si se marca, se desmarca automáticamente cualquier otro método del negocio que lo tuviera',
  })
  @IsOptional()
  @IsBoolean()
  esEfectivo?: boolean;
}
