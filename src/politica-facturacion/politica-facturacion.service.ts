import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Negocio } from '../negocios/entities/negocio.entity';
import { HabilitacionFacturacionElectronica } from '../facturacion-electronica/entities/habilitacion-facturacion-electronica.entity';
import { PeriodoContingencia } from '../facturacion-electronica/entities/periodo-contingencia.entity';
import { OrigenObligacion } from '../negocios/entities/perfil-fiscal.enum';
import { DeclararPerfilFiscalDto } from './dto/declarar-perfil-fiscal.dto';
import { calcularEstado, EstadoFacturacion, obligadoPorDeclaracion } from './politica-facturacion.logic';

/** Lo que ven el POS y la página de facturación: la política + si hay una contingencia abierta (fase 6a). */
export type EstadoPolitica = EstadoFacturacion & { contingenciaActiva: boolean };

/**
 * Única fuente de verdad de qué comprobante le corresponde a un negocio (spec de unificación de
 * comprobantes, 4.2). Lee repositorios directo — no depende de NegociosService ni de
 * FacturacionElectronicaService — para no crear ciclos con VentasModule.
 */
@Injectable()
export class PoliticaFacturacionService {
  constructor(
    @InjectRepository(Negocio) private readonly negocios: Repository<Negocio>,
    @InjectRepository(HabilitacionFacturacionElectronica)
    private readonly habilitaciones: Repository<HabilitacionFacturacionElectronica>,
    @InjectRepository(PeriodoContingencia)
    private readonly periodos: Repository<PeriodoContingencia>,
  ) {}

  async estado(negocioId: string): Promise<EstadoPolitica> {
    return this.estadoDe(await this.negocioOFallar(negocioId));
  }

  private async estadoDe(negocio: Negocio): Promise<EstadoPolitica> {
    const habilitacion = await this.habilitaciones.findOne({ where: { negocioId: negocio.id } });
    const contingenciaActiva = (await this.periodos.count({ where: { negocioId: negocio.id, fin: IsNull() } })) > 0;
    return { ...calcularEstado(negocio, habilitacion), contingenciaActiva };
  }

  async declararPerfil(negocioId: string, usuarioId: string, dto: DeclararPerfilFiscalDto): Promise<EstadoPolitica> {
    const negocio = await this.negocioOFallar(negocioId);
    negocio.tipoPersona = dto.tipoPersona;
    negocio.responsabilidadIva = dto.responsabilidadIva;
    negocio.perfilFiscalDeclaradoEn = new Date();
    negocio.perfilFiscalDeclaradoPor = usuarioId;

    // Una obligación por tope de UVT la maneja el cron (fase 3) — la declaración no la toca.
    if (negocio.origenObligacion !== OrigenObligacion.TOPE_UVT) {
      if (obligadoPorDeclaracion(dto.tipoPersona, dto.responsabilidadIva)) {
        // Conserva la fecha si ya estaba obligado: re-declarar no reinicia los 40 días.
        if (!negocio.obligadoDesde) {
          negocio.obligadoDesde = new Date();
          negocio.origenObligacion = OrigenObligacion.DECLARADO;
        }
      } else {
        negocio.obligadoDesde = null;
        negocio.origenObligacion = null;
      }
    }

    await this.negocios.save(negocio);
    return this.estadoDe(negocio);
  }

  private async negocioOFallar(negocioId: string): Promise<Negocio> {
    const negocio = await this.negocios.findOne({ where: { id: negocioId } });
    if (!negocio) throw new NotFoundException('Negocio no encontrado');
    return negocio;
  }
}
