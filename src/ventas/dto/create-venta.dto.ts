import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { TipoVenta } from '../../common/enums/venta.enum';
import { TipoComprobante } from '../../common/enums/tipo-comprobante.enum';
import { CreateDireccionClienteDto } from '../../clientes/dto/create-direccion-cliente.dto';

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
  @ApiProperty({ description: 'Nombre de un método de pago activo del negocio' })
  @IsString()
  @IsNotEmpty()
  metodoPago: string;

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

export class DomicilioVentaDto {
  @ApiProperty({
    required: false,
    description:
      'Dirección ya guardada del cliente. Si no se envía, debe venir direccionNueva.',
  })
  @IsOptional()
  @IsUUID()
  direccionClienteId?: string;

  @ApiProperty({ required: false, type: CreateDireccionClienteDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateDireccionClienteDto)
  direccionNueva?: CreateDireccionClienteDto;

  @ApiProperty({
    required: false,
    description: 'Informativo — no afecta el total de la venta',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costoDomicilio?: number;
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
    enum: TipoComprobante,
    required: false,
    description: 'Si no se envía, se usa el tipo por defecto configurado en la sucursal (recibo por default)',
  })
  @IsOptional()
  @IsEnum(TipoComprobante)
  tipoComprobante?: TipoComprobante;

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

  @ApiProperty({
    required: false,
    description:
      'PIN de un usuario con VENTAS:ELIMINAR — requerido cuando hay descuentoVenta y quien cobra no tiene ese permiso (ej. un cajero pidiendo aprobación sin cambiar de sesión)',
  })
  @IsOptional()
  @Matches(/^\d{4,6}$/, {
    message: 'El PIN debe tener entre 4 y 6 dígitos numéricos',
  })
  pinAutorizacionDescuento?: string;

  @ApiProperty({
    required: false,
    description: 'Código de cupón a redimir en esta venta — se valida y aplica de forma autoritativa en el servidor',
  })
  @IsOptional()
  @IsString()
  cuponCodigo?: string;

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

  @ApiProperty({
    required: false,
    type: DomicilioVentaDto,
    description:
      'Si se envía, la venta requiere un cliente real (clienteId) — las direcciones dependen de él.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DomicilioVentaDto)
  domicilio?: DomicilioVentaDto;
}
