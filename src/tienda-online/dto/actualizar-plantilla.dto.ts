import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PlantillaTienda } from '../../common/enums/plantilla-tienda.enum';

export class ActualizarPlantillaDto {
  @ApiProperty({ enum: PlantillaTienda })
  @IsEnum(PlantillaTienda)
  plantilla: PlantillaTienda;
}
