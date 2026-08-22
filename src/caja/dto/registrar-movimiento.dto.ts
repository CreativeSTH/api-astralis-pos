import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { TipoMovimientoCaja } from '../../common/enums/caja.enum';

export class RegistrarMovimientoDto {
  @ApiProperty()
  @IsUUID()
  turnoId: string;

  @ApiProperty({
    enum: TipoMovimientoCaja,
    enumName: 'TipoMovimientoCajaManual',
    description:
      'Movimientos manuales: INGRESO, EGRESO o RETIRO (VENTA la registra el sistema)',
  })
  @IsIn([
    TipoMovimientoCaja.INGRESO,
    TipoMovimientoCaja.EGRESO,
    TipoMovimientoCaja.RETIRO,
  ])
  tipo: TipoMovimientoCaja;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  monto: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  concepto?: string;
}
