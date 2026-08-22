import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelarDomicilioDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  motivo?: string;
}
