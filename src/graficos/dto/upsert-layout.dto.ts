import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

export class WidgetLayoutDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsUUID()
  graficoId: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  x: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  y: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  w: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  h: number;
}

/** Reemplaza el layout completo de una página (upsert) — el frontend siempre manda el array entero. */
export class UpsertLayoutDto {
  @ApiProperty({ type: [WidgetLayoutDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WidgetLayoutDto)
  widgets: WidgetLayoutDto[];
}
