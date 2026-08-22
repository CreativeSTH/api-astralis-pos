import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { SeveridadAlerta } from '../../common/enums/alerta.enum';

export class CreateAlertaDto {
  @ApiProperty({ enum: SeveridadAlerta })
  @IsEnum(SeveridadAlerta)
  severidad: SeveridadAlerta;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  mensaje: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
