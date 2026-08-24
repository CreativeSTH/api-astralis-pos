import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsPositive, IsString, IsUUID, ValidateNested } from 'class-validator';

export class ValidarCuponItemDto {
  @ApiProperty()
  @IsUUID()
  productoId: string;

  @ApiProperty()
  @IsPositive()
  cantidad: number;

  @ApiProperty()
  @IsPositive()
  precioUnitario: number;
}

export class ValidarCuponDto {
  @ApiProperty()
  @IsString()
  codigo: string;

  @ApiProperty()
  @IsUUID()
  sucursalId: string;

  @ApiProperty()
  @IsUUID()
  bodegaId: string;

  @ApiProperty({ type: [ValidarCuponItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ValidarCuponItemDto)
  items: ValidarCuponItemDto[];
}
