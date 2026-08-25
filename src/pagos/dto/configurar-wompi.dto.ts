import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConfigurarWompiDto {
  @IsString()
  @IsNotEmpty()
  llavePublica: string;

  @IsString()
  @IsNotEmpty()
  llavePrivada: string;

  @IsString()
  @IsNotEmpty()
  llaveSecretaEventos: string;

  @IsString()
  @IsNotEmpty()
  llaveIntegridad: string;

  @IsOptional()
  @IsBoolean()
  qrHabilitado?: boolean;

  @IsOptional()
  @IsBoolean()
  nequiHabilitado?: boolean;

  @IsOptional()
  @IsBoolean()
  pseHabilitado?: boolean;

  @IsOptional()
  @IsBoolean()
  tarjetaHabilitado?: boolean;
}
