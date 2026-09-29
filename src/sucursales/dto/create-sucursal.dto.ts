import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateSucursalDto {
  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiProperty({ required: false, description: '0 o vacío = sin meta definida' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  metaVentasDiaria?: number;

  @ApiProperty({ required: false, description: 'Debe ser una bodega que pertenezca a esta misma sucursal' })
  @IsOptional()
  @IsUUID()
  bodegaOperativaId?: string;
}
