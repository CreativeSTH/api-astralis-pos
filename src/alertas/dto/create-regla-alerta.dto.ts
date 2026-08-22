import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { TipoCondicionAlerta } from '../../common/enums/condicion-alerta.enum';
import { SeveridadAlerta } from '../../common/enums/alerta.enum';

export class CreateReglaAlertaDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  nombre: string;

  @ApiProperty({ enum: TipoCondicionAlerta })
  @IsEnum(TipoCondicionAlerta)
  tipoCondicion: TipoCondicionAlerta;

  @ApiProperty({
    description: 'Horas o días según tipoCondicion (ver enum) — ej. 24 para "más de 24 horas"',
  })
  @IsNumber()
  @Min(1)
  valor: number;

  @ApiProperty({ enum: SeveridadAlerta })
  @IsEnum(SeveridadAlerta)
  severidad: SeveridadAlerta;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
