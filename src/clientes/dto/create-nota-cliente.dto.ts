import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { TipoNotaCliente } from '../../common/enums/cliente.enum';

export class CreateNotaClienteDto {
  @ApiProperty({ enum: TipoNotaCliente })
  @IsEnum(TipoNotaCliente)
  tipo: TipoNotaCliente;

  @ApiProperty()
  @IsString()
  contenido: string;
}
