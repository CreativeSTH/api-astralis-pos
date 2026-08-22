import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCategoriaDto {
  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty({
    required: false,
    description: 'Si se envía, esta categoría queda como sub-categoría de la indicada',
  })
  @IsOptional()
  @IsUUID()
  categoriaPadreId?: string;
}
