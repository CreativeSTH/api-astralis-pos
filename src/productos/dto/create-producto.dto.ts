import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { UnidadMedida } from '../../common/enums/unidad-medida.enum';
import { TipoImpuesto } from '../../common/enums/tipo-impuesto.enum';
import { StockInicialDto } from './stock-inicial.dto';

export class CreateProductoDto {
  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  codigoBarras?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  marcaId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  lineaId?: string;

  @ApiProperty({ enum: UnidadMedida, default: UnidadMedida.UNIDAD })
  @IsEnum(UnidadMedida)
  unidadMedida: UnidadMedida;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  precioVenta: number;

  @ApiProperty({ default: 0 })
  @IsNumber()
  @Min(0)
  costo: number;

  @ApiProperty({
    enum: TipoImpuesto,
    default: TipoImpuesto.GRAVADO,
    description:
      'GRAVADO usa porcentajeImpuesto; EXCLUIDO/EXENTO tributan al 0%',
  })
  @IsOptional()
  @IsEnum(TipoImpuesto)
  tipoImpuesto?: TipoImpuesto;

  @ApiProperty({
    default: 0,
    description: 'Solo aplica cuando tipoImpuesto es GRAVADO',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  porcentajeImpuesto?: number;

  @ApiProperty({
    required: false,
    type: [StockInicialDto],
    description:
      'Carga de stock inicial por bodega al crear el producto (llega como JSON string en multipart). ' +
      'No se valida a nivel de DTO por el conflicto conocido entre @Transform y @Type con arrays anidados ' +
      'enviados como string — ProductosService valida cada fila antes de usarla.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? (JSON.parse(value) as unknown) : value,
  )
  @IsArray()
  stockInicial?: StockInicialDto[];
}
