import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { FuenteDatoGrafico } from '../../common/enums/fuente-dato-grafico.enum';

export class SerieGraficoDto {
  @ApiProperty({ enum: FuenteDatoGrafico })
  @IsEnum(FuenteDatoGrafico)
  fuenteDato: FuenteDatoGrafico;

  @ApiProperty()
  @IsString()
  etiqueta: string;

  @ApiProperty({ required: false, description: 'Si se envía, la serie se limita a esa sucursal' })
  @IsOptional()
  @IsUUID()
  sucursalId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;
}

export class RangoFechaGraficoDto {
  @ApiProperty({ enum: ['FIJO', 'RELATIVO'] })
  @IsEnum(['FIJO', 'RELATIVO'])
  modo: 'FIJO' | 'RELATIVO';

  @ApiProperty({ required: false, description: 'ISO date — solo si modo=FIJO' })
  @IsOptional()
  @IsString()
  desde?: string;

  @ApiProperty({ required: false, description: 'ISO date — solo si modo=FIJO' })
  @IsOptional()
  @IsString()
  hasta?: string;

  @ApiProperty({ required: false, description: 'Ventana móvil hasta hoy — solo si modo=RELATIVO' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  diasRelativos?: number;
}

export class CompararGraficoDto {
  @ApiProperty()
  @IsBoolean()
  activo: boolean;

  @ApiProperty({ enum: ['PERIODO_ANTERIOR', 'MISMO_PERIODO_ANIO_ANTERIOR'] })
  @IsEnum(['PERIODO_ANTERIOR', 'MISMO_PERIODO_ANIO_ANTERIOR'])
  tipo: 'PERIODO_ANTERIOR' | 'MISMO_PERIODO_ANIO_ANTERIOR';
}

export class OpcionesGraficoDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  mostrarLeyenda?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  apilado?: boolean;
}

export class ConfiguracionGraficoDto {
  @ApiProperty({ type: [SerieGraficoDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SerieGraficoDto)
  series: SerieGraficoDto[];

  @ApiProperty({ type: RangoFechaGraficoDto })
  @ValidateNested()
  @Type(() => RangoFechaGraficoDto)
  rangoFecha: RangoFechaGraficoDto;

  @ApiProperty({ enum: ['DIA', 'SEMANA', 'MES'] })
  @IsEnum(['DIA', 'SEMANA', 'MES'])
  agrupacion: 'DIA' | 'SEMANA' | 'MES';

  @ApiProperty({ required: false, type: CompararGraficoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompararGraficoDto)
  comparar?: CompararGraficoDto;

  @ApiProperty({ required: false, type: OpcionesGraficoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OpcionesGraficoDto)
  opciones?: OpcionesGraficoDto;
}
