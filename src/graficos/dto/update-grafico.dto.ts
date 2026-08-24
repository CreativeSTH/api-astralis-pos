import { PartialType } from '@nestjs/swagger';
import { CreateGraficoDto } from './create-grafico.dto';

export class UpdateGraficoDto extends PartialType(CreateGraficoDto) {}
