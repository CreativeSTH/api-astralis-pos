import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class CreateLineaDto {
  @ApiProperty()
  @IsUUID()
  marcaId: string;

  @ApiProperty()
  @IsString()
  nombre: string;
}
