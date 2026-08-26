import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ActualizarLegalesDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  terminos?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tratamientoDatos?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  politicaEnvios?: string;
}
