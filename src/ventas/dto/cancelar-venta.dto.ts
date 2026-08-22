import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class CancelarVentaDto {
  @ApiProperty()
  @IsString()
  motivo: string;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  devolverStock?: boolean;

  @ApiProperty({
    required: false,
    description:
      'PIN de un ADMIN_NEGOCIO — requerido cuando quien cancela no es admin (ej. un cajero pidiendo aprobación sin cambiar de sesión)',
  })
  @IsOptional()
  @Matches(/^\d{4,6}$/, {
    message: 'El PIN debe tener entre 4 y 6 dígitos numéricos',
  })
  pinAutorizacion?: string;
}
