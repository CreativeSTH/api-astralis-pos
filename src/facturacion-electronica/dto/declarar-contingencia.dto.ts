import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class DeclararContingenciaDto {
  @ApiProperty({ example: 'Sin internet en el local' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  motivo: string;

  @ApiProperty({ required: false, description: 'Inicio real si fue antes de declararla (ISO). Default: ahora.' })
  @IsOptional()
  @IsDateString()
  inicio?: string;
}
