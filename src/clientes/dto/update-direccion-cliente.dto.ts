import { PartialType } from '@nestjs/swagger';
import { CreateDireccionClienteDto } from './create-direccion-cliente.dto';

export class UpdateDireccionClienteDto extends PartialType(
  CreateDireccionClienteDto,
) {}
