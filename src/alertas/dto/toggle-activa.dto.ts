import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleActivaDto {
  @ApiProperty()
  @IsBoolean()
  activa: boolean;
}
