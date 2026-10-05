import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { EstadoTraslado } from '../../common/enums/estado-traslado.enum';

export class FiltrosTrasladosDto {
  @ApiProperty({ required: false, enum: EstadoTraslado })
  @IsOptional()
  @IsEnum(EstadoTraslado)
  estado?: EstadoTraslado;

  @ApiProperty({ required: false, description: 'Origen o destino' })
  @IsOptional()
  @IsUUID()
  bodegaId?: string;

  @ApiProperty({ required: false, description: 'YYYY-MM-DD, inclusive, hora Colombia' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiProperty({ required: false, description: 'YYYY-MM-DD, inclusive, hora Colombia' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}
