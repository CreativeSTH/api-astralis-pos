import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class GuardarMedioPagoDto {
  @ApiProperty({ description: 'Token de tarjeta de Wompi (tok_...), generado en el navegador con la llave pública' })
  @IsString()
  @Matches(/^tok_/, { message: 'token debe ser un token de tarjeta de Wompi' })
  token: string;

  @ApiProperty()
  @Matches(/^\d{4}$/, { message: 'ultimosCuatroDigitos debe ser exactamente 4 dígitos' })
  ultimosCuatroDigitos: string;
}
