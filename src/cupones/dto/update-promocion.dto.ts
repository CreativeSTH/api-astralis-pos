import { PartialType } from '@nestjs/swagger';
import { CreatePromocionDto } from './create-promocion.dto';

export class UpdatePromocionDto extends PartialType(CreatePromocionDto) {}
