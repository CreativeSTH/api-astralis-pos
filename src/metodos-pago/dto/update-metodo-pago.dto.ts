import { PartialType } from '@nestjs/swagger';
import { CreateMetodoPagoDto } from './create-metodo-pago.dto';

export class UpdateMetodoPagoDto extends PartialType(CreateMetodoPagoDto) {}
