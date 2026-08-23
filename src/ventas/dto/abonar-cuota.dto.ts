import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class AbonarCuotaDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  numeroCuota: number;

  @ApiProperty()
  @IsPositive()
  montoAbono: number;

  @ApiProperty({ description: 'Nombre de un método de pago activo del negocio' })
  @IsString()
  @IsNotEmpty()
  metodoPago: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  referenciaPago?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notas?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  incluirMora?: boolean;
}
