import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class StockInicialDto {
  @ApiProperty()
  @IsUUID()
  bodegaId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  cantidad: number;
}
