import { PartialType } from '@nestjs/swagger';
import { CreateReglaAlertaDto } from './create-regla-alerta.dto';

export class UpdateReglaAlertaDto extends PartialType(CreateReglaAlertaDto) {}
