import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { TipoComprobante } from '../../common/enums/tipo-comprobante.enum';

export class CreateSucursalDto {
  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiProperty({ required: false, description: '0 o vacío = sin meta definida' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  metaVentasDiaria?: number;

  @ApiProperty({
    enum: TipoComprobante,
    required: false,
    description: 'Qué se expide por defecto al cobrar si el cajero no elige explícitamente',
  })
  @IsOptional()
  @IsEnum(TipoComprobante)
  tipoComprobanteDefecto?: TipoComprobante;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  plantillaReciboDefectoId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  plantillaFacturaDefectoId?: string;
}
