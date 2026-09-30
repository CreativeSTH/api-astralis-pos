import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class FinalizarContingenciaDto {
  @ApiProperty({ required: false, description: 'Momento en que se superó el inconveniente (ISO). Default: ahora.' })
  @IsOptional()
  @IsDateString()
  fin?: string;
}
