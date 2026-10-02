import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { FormaReembolso } from '../devolucion.logic';

export class ItemDevolucionDto {
  @IsUUID()
  ventaItemId: string;

  /** Misma escala que `VentaItem.cantidad` (2 decimales). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  cantidad: number;

  @IsBoolean()
  vuelveAInventario: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivoBaja?: string;
}

export class ReembolsoDto {
  @IsIn(['EFECTIVO', 'DESCUENTO_DEUDA', 'SALDO_A_FAVOR'])
  forma: FormaReembolso;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;
}

export class CrearDevolucionDto {
  @IsUUID()
  ventaId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  motivo: string;

  @ValidateNested({ each: true })
  @Type(() => ItemDevolucionDto)
  @ArrayMinSize(1)
  items: ItemDevolucionDto[];

  @ValidateNested({ each: true })
  @Type(() => ReembolsoDto)
  @ArrayMinSize(1)
  reembolsos: ReembolsoDto[];

  /** PIN de un usuario con DEVOLUCIONES:CREAR cuando quien devuelve no tiene ese permiso. */
  @IsOptional()
  @Matches(/^\d{4,6}$/)
  pinAutorizacion?: string;
}
