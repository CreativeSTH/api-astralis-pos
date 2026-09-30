import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
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
import { VentaPagoDto } from './create-venta.dto';

export class ItemSinConexionDto {
  @IsUUID()
  productoId: string;

  @IsPositive()
  cantidad: number;

  /** Precio unitario (sin impuesto) impreso en la caja, con la promoción que estuviera vigente en su foto. */
  @IsNumber()
  @Min(0)
  precioUnitario: number;

  @IsNumber()
  @Min(0)
  porcentajeImpuesto: number;
}

export class ResolucionSinConexionDto {
  @Matches(/^\d{1,14}$/)
  numero: string;

  @Matches(/^[A-Za-z0-9]{1,4}$/)
  prefijo: string;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsInt()
  @Min(1)
  rangoDesde: number;

  @IsInt()
  @Min(1)
  rangoHasta: number;
}

export class ComprobanteSinConexionDto {
  @IsIn(['CONTINGENCIA', 'RECIBO_PROVISIONAL'])
  tipo: 'CONTINGENCIA' | 'RECIBO_PROVISIONAL';

  /** CONTINGENCIA: número del bloque de la caja. */
  @IsOptional()
  @IsInt()
  @Min(1)
  numero?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ResolucionSinConexionDto)
  resolucion?: ResolucionSinConexionDto;

  /** Lo impreso (`CONT7`, `SCab12-3`). */
  @IsString()
  numeroImpreso: string;
}

export class VentaSinConexionDto {
  @IsUUID('4')
  idLocal: string;

  @IsUUID()
  episodioId: string;

  @IsDateString()
  creadaEn: string;

  @IsUUID()
  turnoId: string;

  @IsUUID()
  sucursalId: string;

  @IsUUID()
  bodegaId: string;

  @IsIn([TipoVenta.CONTADO, TipoVenta.CREDITO])
  tipoVenta: TipoVenta;

  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @IsOptional()
  @IsString()
  nombreCliente?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemSinConexionDto)
  items: ItemSinConexionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VentaPagoDto)
  pagos?: VentaPagoDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  numeroCuotas?: number;

  @IsOptional()
  @IsDateString()
  fechaPrimerPago?: string;

  @ValidateNested()
  @Type(() => ComprobanteSinConexionDto)
  comprobante: ComprobanteSinConexionDto;
}

export class EpisodioSinConexionDto {
  @IsUUID()
  id: string;

  @IsDateString()
  inicio: string;

  @IsDateString()
  fin: string;
}

/** Fase 6b: lo que una caja vendió sin conexión, con los episodios en que lo hizo. */
export class SincronizarSinConexionDto {
  @ApiProperty({ type: [EpisodioSinConexionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EpisodioSinConexionDto)
  episodios: EpisodioSinConexionDto[];

  @ApiProperty({ type: [VentaSinConexionDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VentaSinConexionDto)
  ventas: VentaSinConexionDto[];
}
