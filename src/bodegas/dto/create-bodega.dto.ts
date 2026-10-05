import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsUUID } from 'class-validator';

export class CreateBodegaDto {
  @ApiProperty({ type: [String], description: 'Sucursales que venden de esta bodega. Vacío = bodega central (CEDI).' })
  @IsArray()
  @IsUUID('all', { each: true })
  sucursalIds: string[];

  @ApiProperty()
  @IsString()
  nombre: string;
}
