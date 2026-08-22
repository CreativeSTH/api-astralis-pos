import { PartialType } from '@nestjs/swagger';
import { CreateBodegaDto } from './create-bodega.dto';

export class UpdateBodegaDto extends PartialType(CreateBodegaDto) {}
