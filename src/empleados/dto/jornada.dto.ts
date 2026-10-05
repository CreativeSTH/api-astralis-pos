import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

class ConMotivo {
  @ApiProperty({ description: 'Por qué se corrige (queda en la auditoría)' })
  @IsString()
  @MinLength(3, { message: 'Escribe el motivo de la corrección' })
  @MaxLength(300)
  motivo: string;
}

export class CrearJornadaDto extends ConMotivo {
  @ApiProperty() @IsUUID() empleadoId: string;
  @ApiProperty() @IsUUID() sucursalId: string;
  @ApiProperty({ description: 'Instante ISO 8601' }) @IsDateString() entrada: string;
  @ApiProperty({ required: false, description: 'Sin salida = sigue adentro' }) @IsOptional() @IsDateString() salida?: string;
}

export class CorregirJornadaDto extends ConMotivo {
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() entrada?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() salida?: string;
}

export class EliminarJornadaDto extends ConMotivo {}

export class FiltrosAsistenciaDto {
  @ApiProperty({ example: '2026-10-05' }) @IsDateString() desde: string;
  @ApiProperty({ example: '2026-10-11' }) @IsDateString() hasta: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() empleadoId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() sucursalId?: string;
}
