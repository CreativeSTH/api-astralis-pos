import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class MarcarEnCaminoDto {
  @ApiProperty({ required: false, description: 'Quién lo lleva' })
  @IsOptional()
  @IsString()
  domiciliarioNombre?: string;
}
