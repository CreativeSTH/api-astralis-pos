import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateMarcaDto {
  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty({
    required: false,
    description: 'Si se envía, esta marca queda como sub-marca de la indicada',
  })
  @IsOptional()
  @IsUUID()
  marcaPadreId?: string;
}
