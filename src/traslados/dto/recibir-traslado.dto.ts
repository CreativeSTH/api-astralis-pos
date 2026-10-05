import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsUUID, Min, ValidateNested } from 'class-validator';

export class ItemRecibidoDto {
  @ApiProperty()
  @IsUUID()
  productoId: string;

  @ApiProperty({ description: 'Lo que realmente llegó; la diferencia con lo enviado queda como faltante' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cantidadRecibida: number;
}

export class RecibirTrasladoDto {
  @ApiProperty({ type: [ItemRecibidoDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemRecibidoDto)
  items: ItemRecibidoDto[];
}
