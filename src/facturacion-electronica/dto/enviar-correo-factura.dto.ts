import { IsEmail, IsOptional } from 'class-validator';

export class EnviarCorreoFacturaDto {
  /** Si viene, se envía acá en vez de al correo del cliente (no lo cambia en el cliente). */
  @IsOptional()
  @IsEmail({}, { message: 'Escribe un correo válido' })
  correo?: string;
}
