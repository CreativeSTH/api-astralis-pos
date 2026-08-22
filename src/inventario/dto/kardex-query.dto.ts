import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class KardexQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  productoId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  bodegaId?: string;

  @ApiProperty({ required: false, description: 'ISO date, inclusive' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiProperty({ required: false, description: 'ISO date, inclusive' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}
