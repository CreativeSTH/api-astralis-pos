import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateItemPedidoDto {
  @ApiProperty()
  @IsUUID()
  productoId: string;
}
