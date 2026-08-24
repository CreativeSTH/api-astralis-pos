import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsString, ValidateNested } from 'class-validator';
import { TipoGrafico } from '../../common/enums/tipo-grafico.enum';
import { ConfiguracionGraficoDto } from './configuracion-grafico.dto';

export class CreateGraficoDto {
  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty({ enum: TipoGrafico })
  @IsEnum(TipoGrafico)
  tipo: TipoGrafico;

  @ApiProperty({ type: ConfiguracionGraficoDto })
  @ValidateNested()
  @Type(() => ConfiguracionGraficoDto)
  configuracion: ConfiguracionGraficoDto;
}
