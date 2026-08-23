import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsString, Min, ValidateNested } from 'class-validator';

export class MontoContadoDto {
  @ApiProperty({ description: 'Nombre de un método de pago activo del negocio' })
  @IsString()
  @IsNotEmpty()
  metodoPago: string;

  @ApiProperty({ description: 'Monto contado físicamente/conciliado para este método' })
  @IsNumber()
  @Min(0)
  monto: number;
}

export class CerrarTurnoDto {
  @ApiProperty({
    type: [MontoContadoDto],
    description: 'Monto contado por cada método de pago que tuvo movimiento en el turno (el método en efectivo siempre presente)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MontoContadoDto)
  montosContados: MontoContadoDto[];
}
