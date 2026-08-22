import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProveedorNuevoDto } from '../../proveedores/dto/vincular-proveedor.dto';

export class RealizarPedidoDto {
  @ApiProperty({
    required: false,
    description:
      'ID de un proveedor ya vinculado a este producto. Si no se envía, debe venir proveedorNuevo.',
  })
  @IsOptional()
  @IsUUID()
  proveedorId?: string;

  @ApiProperty({ required: false, type: ProveedorNuevoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProveedorNuevoDto)
  proveedorNuevo?: ProveedorNuevoDto;

  @ApiProperty({ description: 'Precio de compra pactado con el proveedor' })
  @IsNumber()
  @Min(0)
  costoUnitario: number;

  @ApiProperty({ description: 'Cantidad de unidades pedidas' })
  @IsNumber()
  @Min(0.001)
  cantidad: number;
}
