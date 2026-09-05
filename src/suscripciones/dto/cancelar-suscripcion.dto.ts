import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelarSuscripcionDto {
  @ApiProperty({ required: false, description: 'Motivo corto y opcional, para saber por qué se cancela' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}
