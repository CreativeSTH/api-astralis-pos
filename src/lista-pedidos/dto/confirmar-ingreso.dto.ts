import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class ConfirmarIngresoDto {
  @ApiProperty({ description: 'Bodega donde entra el stock' })
  @IsUUID()
  bodegaId: string;

  @ApiProperty({
    required: false,
    description:
      'Si el costo subió y se decide actualizar el precio de venta, el nuevo valor. Se resuelve en el frontend antes de confirmar.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  nuevoPrecioVenta?: number;
}
