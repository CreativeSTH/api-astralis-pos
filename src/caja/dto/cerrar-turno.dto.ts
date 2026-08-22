import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsNumber, Min, ValidateNested } from 'class-validator';
import { MetodoPago } from '../../common/enums/venta.enum';

export class MontoContadoDto {
  @ApiProperty({ enum: MetodoPago })
  @IsEnum(MetodoPago)
  metodoPago: MetodoPago;

  @ApiProperty({ description: 'Monto contado físicamente/conciliado para este método' })
  @IsNumber()
  @Min(0)
  monto: number;
}

export class CerrarTurnoDto {
  @ApiProperty({
    type: [MontoContadoDto],
    description: 'Monto contado por cada método de pago que tuvo movimiento en el turno (EFECTIVO siempre presente)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MontoContadoDto)
  montosContados: MontoContadoDto[];
}
