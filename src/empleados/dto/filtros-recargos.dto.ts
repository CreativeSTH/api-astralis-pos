import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class FiltrosRecargosDto {
  @ApiProperty({ example: '2026-10-01' }) @IsDateString() desde: string;
  @ApiProperty({ example: '2026-10-31' }) @IsDateString() hasta: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() empleadoId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() sucursalId?: string;
}
