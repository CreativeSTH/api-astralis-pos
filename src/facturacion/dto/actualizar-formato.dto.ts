import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ActualizarFormatoDto {
  /** Se imprime al pie de cada recibo y factura. Vacío = sin mensaje. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mensajeCierre?: string | null;

  /** Condiciones (devoluciones, garantías…). Vacío = sin términos. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  terminos?: string | null;
}
