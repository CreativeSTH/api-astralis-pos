import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class StockInicialDto {
  @ApiProperty()
  @IsUUID()
  bodegaId: string;

  @ApiProperty({
    description: '0 es válido — registra el producto en esta bodega aunque todavía no tenga stock.',
  })
  @IsNumber()
  @Min(0)
  cantidad: number;
}
