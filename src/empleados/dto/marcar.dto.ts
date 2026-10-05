import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class MarcarDto {
  @ApiProperty({ description: 'PIN de marcación del empleado' }) @IsString() pin: string;
  @ApiProperty({ description: 'Sucursal de la caja donde se marca' }) @IsUUID() sucursalId: string;
}

export interface ResultadoMarca {
  tipo: 'ENTRADA' | 'SALIDA';
  empleado: { id: string; nombre: string };
  momento: Date;
  duracionMinutos?: number;
}
