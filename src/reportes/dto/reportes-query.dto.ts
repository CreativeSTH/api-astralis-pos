import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ReportesQueryDto {
  @ApiProperty({
    required: false,
    description: 'ISO date, inclusive. Por defecto: 30 días atrás.',
  })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiProperty({
    required: false,
    description: 'ISO date, inclusive. Por defecto: hoy.',
  })
  @IsOptional()
  @IsDateString()
  hasta?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  sucursalId?: string;
}
