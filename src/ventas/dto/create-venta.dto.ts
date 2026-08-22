import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { MetodoPago, TipoVenta } from '../../common/enums/venta.enum';

export class VentaItemDto {
  @ApiProperty()
  @IsUUID()
  productoId: string;

  @ApiProperty()
  @IsPositive()
  cantidad: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  descuento?: number;
}

export class VentaPagoDto {
  @ApiProperty({ enum: MetodoPago })
  @IsEnum(MetodoPago)
  metodoPago: MetodoPago;

  @ApiProperty({
    description:
      'Monto aplicado a la venta con este método (no incluye cambio)',
  })
  @IsPositive()
  monto: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  referencia?: string;
}

export class CreateVentaDto {
  @ApiProperty()
  @IsUUID()
  sucursalId: string;

  @ApiProperty({
    description: 'Bodega de la que se descuenta el stock vendido',
  })
  @IsUUID()
  bodegaId: string;

  @ApiProperty({
    required: false,
    description: 'Obligatorio para ventas CREDITO',
  })
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @ApiProperty({ required: false, default: 'Consumidor final' })
  @IsOptional()
  @IsString()
  nombreCliente?: string;

  @ApiProperty({ enum: TipoVenta, default: TipoVenta.CONTADO })
  @IsOptional()
  @IsEnum(TipoVenta)
  tipoVenta?: TipoVenta;

  @ApiProperty({
    required: false,
    description: 'Obligatorio para ventas CREDITO',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  numeroCuotas?: number;

  @ApiProperty({
    required: false,
    description: 'Fecha del primer vencimiento — obligatorio para CREDITO',
  })
  @IsOptional()
  @IsDateString()
  fechaPrimerPago?: string;

  @ApiProperty({
    required: false,
    default: 0.1,
    description: 'Tasa de mora diaria en % — solo CREDITO',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tasaInteresMora?: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  omitirValidacionCredito?: boolean;

  @ApiProperty({
    required: false,
    default: 0,
    description:
      'Descuento manual sobre el total de la venta completa (además de los descuentos por línea)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  descuentoVenta?: number;

  @ApiProperty({ type: [VentaItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VentaItemDto)
  items: VentaItemDto[];

  @ApiProperty({
    type: [VentaPagoDto],
    required: false,
    description:
      'Requerido para CONTADO (pagos mixtos permitidos). No aplica a CREDITO.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VentaPagoDto)
  pagos?: VentaPagoDto[];
}
