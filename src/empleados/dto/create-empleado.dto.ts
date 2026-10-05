import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';
import { TipoDocumentoEmpleado } from '../enums';

export class CreateEmpleadoDto {
  @ApiProperty() @IsString() nombre: string;
  @ApiProperty({ enum: TipoDocumentoEmpleado }) @IsEnum(TipoDocumentoEmpleado) tipoDocumento: TipoDocumentoEmpleado;
  @ApiProperty() @IsString() numeroDocumento: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() cargo?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() sucursalId?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() usuarioId?: string | null;
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) salarioMensual: number;
  @ApiProperty({ required: false, default: true }) @IsOptional() @IsBoolean() aplicaHorasExtra?: boolean;
  @ApiProperty({ description: 'PIN de marcación, 4 a 6 dígitos' })
  @Matches(/^\d{4,6}$/, { message: 'El PIN debe tener entre 4 y 6 dígitos' })
  pin: string;
}

export class UpdateEmpleadoDto extends PartialType(OmitType(CreateEmpleadoDto, ['pin'] as const)) {}
