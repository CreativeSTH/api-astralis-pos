import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateTurnoProgramadoDto {
  @ApiProperty() @IsUUID() empleadoId: string;
  @ApiProperty() @IsUUID() sucursalId: string;
  @ApiProperty({ example: '2026-10-05' }) @IsDateString() fecha: string;
  @ApiProperty({ example: '08:00' }) @Matches(HORA, { message: 'La hora de inicio debe ser HH:MM' }) horaInicio: string;
  @ApiProperty({ example: '16:00' }) @Matches(HORA, { message: 'La hora de fin debe ser HH:MM' }) horaFin: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(200) nota?: string | null;
}

export class UpdateTurnoProgramadoDto extends PartialType(CreateTurnoProgramadoDto) {}

export class FiltrosTurnosDto {
  @ApiProperty() @IsDateString() desde: string;
  @ApiProperty() @IsDateString() hasta: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() sucursalId?: string;
}

export class CopiarSemanaDto {
  @ApiProperty({ description: 'Lunes de la semana destino' }) @IsDateString() lunesDestino: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() sucursalId?: string;
}
