import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsEnum } from 'class-validator';
import { ResponsabilidadIva, TipoPersona } from '../../negocios/entities/perfil-fiscal.enum';

export class DeclararPerfilFiscalDto {
  @ApiProperty({ enum: TipoPersona })
  @IsEnum(TipoPersona)
  tipoPersona: TipoPersona;

  @ApiProperty({ enum: ResponsabilidadIva, description: 'Según el RUT: 48 responsable, 49 no responsable, 47 Régimen Simple' })
  @IsEnum(ResponsabilidadIva)
  responsabilidadIva: ResponsabilidadIva;

  @ApiProperty({ description: 'El administrador declara que estos datos coinciden con su RUT' })
  @Equals(true, { message: 'Tienes que confirmar que los datos coinciden con tu RUT' })
  aceptaDeclaracion: true;
}
