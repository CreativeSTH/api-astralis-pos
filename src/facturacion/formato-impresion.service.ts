import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Negocio } from '../negocios/entities/negocio.entity';
import { ActualizarFormatoDto } from './dto/actualizar-formato.dto';

export interface FormatoImpresion {
  logoUrl: string | null;
  mensajeCierre: string | null;
  terminos: string | null;
}

const limpiar = (valor: string | null | undefined) =>
  valor?.trim() ? valor.trim() : null;

/** Un solo formato de impresión por negocio (fase 5b): logo del negocio + mensaje de cierre + términos. */
@Injectable()
export class FormatoImpresionService {
  constructor(
    @InjectRepository(Negocio) private readonly negocios: Repository<Negocio>,
  ) {}

  async obtener(negocioId: string): Promise<FormatoImpresion> {
    return this.aFormato(await this.negocioOFallar(negocioId));
  }

  async actualizar(
    negocioId: string,
    dto: ActualizarFormatoDto,
  ): Promise<FormatoImpresion> {
    const negocio = await this.negocioOFallar(negocioId);
    if (dto.mensajeCierre !== undefined)
      negocio.mensajeCierreComprobante = limpiar(dto.mensajeCierre);
    if (dto.terminos !== undefined)
      negocio.terminosComprobante = limpiar(dto.terminos);
    return this.aFormato(await this.negocios.save(negocio));
  }

  private aFormato(negocio: Negocio): FormatoImpresion {
    return {
      logoUrl: negocio.logoUrl ?? null,
      mensajeCierre: negocio.mensajeCierreComprobante ?? null,
      terminos: negocio.terminosComprobante ?? null,
    };
  }

  private async negocioOFallar(negocioId: string): Promise<Negocio> {
    const negocio = await this.negocios.findOne({ where: { id: negocioId } });
    if (!negocio) throw new NotFoundException('Negocio no encontrado');
    return negocio;
  }
}
