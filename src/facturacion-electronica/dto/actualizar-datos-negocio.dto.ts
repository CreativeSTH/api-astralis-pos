import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class ActualizarDatosNegocioDto {
  @ApiProperty()
  @IsString()
  razonSocial: string;

  @ApiProperty({
    description:
      'NIT del negocio, sin dígito de verificación ni puntos/guiones — obligatorio para facturar, aunque en "Datos del negocio" (/mi-negocio) sea opcional para un negocio que todavía no activó DIAN.',
  })
  @IsString()
  @Matches(/^\d{5,15}$/, { message: 'El NIT debe tener solo dígitos (sin puntos, guiones ni dígito de verificación)' })
  nit: string;

  @ApiProperty({ description: 'Alegra lo exige como dato de la compañía — obligatorio para facturar.' })
  @IsEmail()
  email: string;

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
