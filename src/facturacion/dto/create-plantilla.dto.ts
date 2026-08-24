import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { TipoComprobante } from '../../common/enums/tipo-comprobante.enum';
import type { ConfiguracionPlantilla } from '../entities/plantilla-comprobante.entity';

export class CreatePlantillaDto {
  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty({ enum: TipoComprobante })
  @IsEnum(TipoComprobante)
  tipo: TipoComprobante;

  @ApiProperty({
    required: false,
    default: false,
    description:
      'Llega como string "true"/"false" en multipart — se normaliza leyendo el valor crudo, porque la ' +
      'conversión implícita de ValidationPipe corre antes que este @Transform y ya habría hecho Boolean("false") === true.',
  })
  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }): unknown => {
    const raw = obj['esPredeterminada'];
    if (raw === 'false') return false;
    if (raw === 'true') return true;
    return raw;
  })
  @IsBoolean()
  esPredeterminada?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Campos de la plantilla (nombrePersonaNatural, direccion, telefono, mensajeCierre, terminos, dian). ' +
      'Llega como JSON string en multipart — no se valida a nivel de DTO, PlantillasComprobanteService lo valida antes de usarlo.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? (JSON.parse(value) as unknown) : value,
  )
  @IsObject()
  configuracion?: ConfiguracionPlantilla;
}
