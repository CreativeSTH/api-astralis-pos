import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class PagarDescuadreDto {
  @ApiProperty({ description: 'Monto pagado/cubierto para saldar el descuadre' })
  @IsNumber()
  @Min(0.01)
  monto: number;
}
