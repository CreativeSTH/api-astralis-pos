import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class CreateBodegaDto {
  @ApiProperty()
  @IsUUID()
  sucursalId: string;

  @ApiProperty()
  @IsString()
  nombre: string;
}
