import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { MetodoPago } from '../../common/enums/venta.enum';

export class AbonarCuotaDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  numeroCuota: number;

  @ApiProperty()
  @IsPositive()
  montoAbono: number;

  @ApiProperty({ enum: MetodoPago })
  @IsEnum(MetodoPago)
  metodoPago: MetodoPago;

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
