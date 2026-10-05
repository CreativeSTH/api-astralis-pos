import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ItemTrasladoDto {
  @ApiProperty()
  @IsUUID()
  productoId: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  cantidad: number;
}

export class CrearTrasladoDto {
  @ApiProperty()
  @IsUUID()
  bodegaOrigenId: string;

  @ApiProperty()
  @IsUUID()
  bodegaDestinoId: string;

  @ApiProperty({ type: [ItemTrasladoDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemTrasladoDto)
  items: ItemTrasladoDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}
