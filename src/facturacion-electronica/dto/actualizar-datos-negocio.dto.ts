import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ActualizarDatosNegocioDto {
  @ApiProperty()
  @IsString()
  razonSocial: string;

  @ApiProperty()
  @IsString()
  direccion: string;

  @ApiProperty({ description: 'Nombre del municipio, solo para mostrar — la validación real la hace ciudadCodigo' })
  @IsString()
  ciudadNombre: string;

  @ApiProperty({ description: 'Código DIVIPOLA del municipio (5 dígitos) — Alegra lo valida contra un enum estricto' })
  @IsString()
  ciudadCodigo: string;

  @ApiProperty({ description: 'Código DIVIPOLA del departamento (2 dígitos), derivado del municipio elegido' })
  @IsString()
  departamentoCodigo: string;

  @ApiProperty({ default: true })
  @IsBoolean()
  useAlegraCertificate: boolean;

  @ApiProperty({ required: false, description: 'Base64 del .pfx — requerido si useAlegraCertificate=false' })
  @IsOptional()
  @IsString()
  certificadoPfxBase64?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  certificadoPassword?: string;
}
