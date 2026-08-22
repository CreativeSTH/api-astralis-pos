import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class AbrirTurnoDto {
  @ApiProperty()
  @IsUUID()
  sucursalId: string;

  @ApiProperty({
    description: 'Fondo inicial en efectivo con el que abre la caja',
  })
  @IsNumber()
  @Min(0)
  montoInicial: number;
}
