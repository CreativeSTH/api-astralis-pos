import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateNegocioDto } from './create-negocio.dto';

export class UpdateNegocioDto extends PartialType(
  OmitType(CreateNegocioDto, ['adminInicial'] as const),
) {}
