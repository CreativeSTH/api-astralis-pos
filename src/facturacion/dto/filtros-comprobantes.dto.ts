import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { EstadoDocumentoElectronico } from '../../facturacion-electronica/entities/estado-documento-electronico.enum';
import type { TipoComprobanteListado } from '../comprobantes-listado';

export const TIPOS_COMPROBANTE_LISTADO: TipoComprobanteListado[] = [
  'FACTURA_ELECTRONICA',
  'RECIBO',
  'FACTURA',
  'RECIBO_CAJA',
  'DEVOLUCION',
];

export class FiltrosComprobantesDto {
  @IsOptional()
  @IsIn(TIPOS_COMPROBANTE_LISTADO)
  tipo?: TipoComprobanteListado;

  @IsOptional()
  @IsEnum(EstadoDocumentoElectronico)
  estadoDian?: EstadoDocumentoElectronico;

  /** `YYYY-MM-DD`, inclusive, día calendario Colombia. */
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  /** Número del comprobante o nombre del cliente. */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina?: number;
}
