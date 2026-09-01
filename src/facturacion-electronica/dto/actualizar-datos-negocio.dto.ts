import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ActualizarDatosNegocioDto {
  @ApiProperty()
  @IsString()
  razonSocial: string;

  @ApiProperty()
  @IsString()
  direccion: string;

  @ApiProperty()
  @IsString()
  ciudad: string;

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
