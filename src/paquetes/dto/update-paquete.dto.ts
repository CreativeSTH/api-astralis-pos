import { PartialType } from '@nestjs/swagger';
import { CreatePaqueteDto } from './create-paquete.dto';

export class UpdatePaqueteDto extends PartialType(CreatePaqueteDto) {}
