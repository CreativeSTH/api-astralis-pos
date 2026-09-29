import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { EstadoDocumentoElectronico } from '../entities/estado-documento-electronico.enum';

export class FiltrosFacturasDto {
  @IsOptional()
  @IsEnum(EstadoDocumentoElectronico)
  estado?: EstadoDocumentoElectronico;

  /** `YYYY-MM-DD`, inclusive — mismo criterio de día UTC que `ReportesService.rangoFechas`. */
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  /** Busca en número completo y nombre del cliente. */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina?: number;
}
