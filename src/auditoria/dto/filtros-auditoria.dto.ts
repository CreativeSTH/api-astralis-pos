import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ModuloPermiso } from '../../common/enums/modulo-permiso.enum';
import { AccionAuditoria } from '../enums/accion-auditoria.enum';

export class PaginacionAuditoriaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina?: number;
}

export class FiltrosAuditoriaDto extends PaginacionAuditoriaDto {
  /** 'YYYY-MM-DD', día calendario Colombia. Sin desde/hasta: últimos 7 días. */
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  @IsOptional()
  @IsEnum(ModuloPermiso)
  modulo?: ModuloPermiso;

  @IsOptional()
  @IsEnum(AccionAuditoria)
  accion?: AccionAuditoria;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  entidad?: string;

  @IsOptional()
  @IsUUID()
  entidadId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  buscar?: string;
}
