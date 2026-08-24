import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/** Override opcional del rango persistido en el gráfico — usado al renderizarlo en una página con su propio filtro de fechas (ej. Reportes). */
export class DatosGraficoQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}
