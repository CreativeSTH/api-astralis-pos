import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { TipoMovimientoInventario } from '../../common/enums/tipo-movimiento-inventario.enum';

export class AjustarStockDto {
  @ApiProperty()
  @IsUUID()
  productoId: string;

  @ApiProperty()
  @IsUUID()
  bodegaId: string;

  @ApiProperty({ enum: TipoMovimientoInventario })
  @IsEnum(TipoMovimientoInventario)
  tipo: TipoMovimientoInventario;

  @ApiProperty({ description: 'Cantidad del movimiento, siempre positiva' })
  @IsNumber()
  @Min(0.001)
  cantidad: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  motivo?: string;
}
