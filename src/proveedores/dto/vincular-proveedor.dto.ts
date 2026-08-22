import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** Alta rápida de proveedor al vincularlo a un producto — solo el nombre es obligatorio, el resto se completa después desde Proveedores. */
export class ProveedorNuevoDto {
  @ApiProperty()
  @IsString()
  nombre: string;
}

export class VincularProveedorDto {
  @ApiProperty({
    required: false,
    description:
      'ID de un proveedor ya existente. Si no se envía, debe venir proveedorNuevo.',
  })
  @IsOptional()
  @IsUUID()
  proveedorId?: string;

  @ApiProperty({ required: false, type: ProveedorNuevoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProveedorNuevoDto)
  proveedorNuevo?: ProveedorNuevoDto;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  costo: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  referencia?: string;
}
