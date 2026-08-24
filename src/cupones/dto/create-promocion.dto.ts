import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { TipoPromocion } from '../../common/enums/tipo-promocion.enum';
import { TipoDescuento } from '../../common/enums/tipo-descuento.enum';

export class CreatePromocionDto {
  @ApiProperty({ enum: TipoPromocion })
  @IsEnum(TipoPromocion)
  tipo: TipoPromocion;

  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty({
    required: false,
    description: 'Obligatorio y único por negocio cuando tipo=CUPON',
  })
  @ValidateIf((dto: CreatePromocionDto) => dto.tipo === TipoPromocion.CUPON)
  @IsString()
  codigo?: string;

  @ApiProperty({ enum: TipoDescuento })
  @IsEnum(TipoDescuento)
  tipoDescuento: TipoDescuento;

  @ApiProperty({ description: 'Porcentaje (0-100) o monto fijo, según tipoDescuento' })
  @IsPositive()
  valor: number;

  @ApiProperty({ required: false, description: 'Solo aplica a CUPON' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  montoMinimoCompra?: number;

  @ApiProperty({ required: false, description: 'Nulo = disponible de inmediato' })
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @ApiProperty({ required: false, description: 'Nulo = sin expiración' })
  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @ApiProperty({ required: false, description: 'Nulo = uso ilimitado' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usoMaximo?: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @ApiProperty({ required: false, type: [String], description: 'Vacío/omitido = todas las sucursales' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  sucursalIds?: string[];

  @ApiProperty({ required: false, type: [String], description: 'Vacío/omitido = todas las bodegas' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  bodegaIds?: string[];

  @ApiProperty({ required: false, type: [String], description: 'Vacío/omitido = todas las categorías' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  categoriaIds?: string[];

  @ApiProperty({ required: false, type: [String], description: 'Vacío/omitido = todos los productos' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  productoIds?: string[];
}
