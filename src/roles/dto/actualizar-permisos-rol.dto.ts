import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ActualizarPermisosRolDto {
  @ApiProperty({ type: [String], description: 'IDs de Permiso a asignar a este rol (reemplaza el set actual)' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  permisoIds: string[];
}
