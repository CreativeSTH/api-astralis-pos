import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class SetStockMinimoDto {
  @ApiProperty()
  @IsUUID()
  productoId: string;

  @ApiProperty()
  @IsUUID()
  bodegaId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  stockMinimo: number;
}
