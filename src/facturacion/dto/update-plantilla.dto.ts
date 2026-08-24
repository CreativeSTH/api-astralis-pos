import { PartialType } from '@nestjs/swagger';
import { CreatePlantillaDto } from './create-plantilla.dto';

export class UpdatePlantillaDto extends PartialType(CreatePlantillaDto) {}
