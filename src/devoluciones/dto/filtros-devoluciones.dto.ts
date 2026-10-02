import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class FiltrosDevolucionesDto {
  /** 'YYYY-MM-DD', día calendario Colombia. */
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  @IsOptional()
  @IsIn(['EFECTIVO', 'DESCUENTO_DEUDA', 'SALDO_A_FAVOR'])
  forma?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina?: number;
}
