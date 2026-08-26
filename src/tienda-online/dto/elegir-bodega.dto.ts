import { IsUUID } from 'class-validator';

export class ElegirBodegaDto {
  @IsUUID()
  bodegaId: string;
}
