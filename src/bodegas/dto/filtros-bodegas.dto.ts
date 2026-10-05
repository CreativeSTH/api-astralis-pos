import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class FiltrosBodegasDto {
  @ApiProperty({ required: false, description: 'Solo las bodegas asociadas a esta sucursal' })
  @IsOptional()
  @IsUUID()
  sucursalId?: string;
}
