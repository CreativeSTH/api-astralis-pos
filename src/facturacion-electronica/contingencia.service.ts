import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, MoreThanOrEqual, Not, QueryFailedError, Repository } from 'typeorm';
import { HabilitacionFacturacionElectronica } from './entities/habilitacion-facturacion-electronica.entity';
import { PeriodoContingencia } from './entities/periodo-contingencia.entity';
import { ReservaContingencia } from './entities/reserva-contingencia.entity';
import { PROVEEDOR_TECNOLOGICO, nitConDv } from './factura-pdf.service';
import { fabricanteSoftware } from './contingencia.util';
import { Negocio } from '../negocios/entities/negocio.entity';
import { DocumentoElectronico } from './entities/documento-electronico.entity';
import { EstadoHabilitacion } from './entities/estado-habilitacion.enum';
import { EstadoDocumentoElectronico } from './entities/estado-documento-electronico.enum';
import { CargarResolucionContingenciaDto } from './dto/cargar-resolucion-contingencia.dto';
import { DeclararContingenciaDto } from './dto/declarar-contingencia.dto';
import { FinalizarContingenciaDto } from './dto/finalizar-contingencia.dto';
import { Alerta } from '../alertas/entities/alerta.entity';
import { SeveridadAlerta, TipoAlerta } from '../common/enums/alerta.enum';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Alegra sin responder durante este tiempo seguido → contingencia automática (decisión del plan de la fase 6a). */
export const UMBRAL_CONTINGENCIA_AUTOMATICA_MS = 5 * 60 * 1000;
/** Res. 000227 de 2025, art. 1.5.1.5.7.1, num. 1.1.2: 48 h desde que se supera el inconveniente. */
export const PLAZO_TRANSMISION_MS = 48 * 60 * 60 * 1000;
/** La alerta salta con la mitad del plazo consumido. */
const AVISO_PLAZO_MS = 24 * 60 * 60 * 1000;
const ESTADOS_ACEPTADOS = [EstadoDocumentoElectronico.ACEPTADO, EstadoDocumentoElectronico.ACEPTADO_CON_OBSERVACIONES];

export interface ResolucionContingencia {
  numero: string;
  prefijo: string;
  fechaInicio: string;
  fechaFin: string;
  rangoDesde: number;
  rangoHasta: number;
  siguienteNumero: number;
}

/** Fase 6b: números por bloque reservado para una caja. */
export const TAMANO_BLOQUE_CONTINGENCIA = 50;

export type ResolucionContingenciaSnapshot = Omit<ResolucionContingencia, 'siguienteNumero'>;

export interface BloqueContingencia {
  desde: number;
  hasta: number;
  resolucion: ResolucionContingenciaSnapshot;
}

export interface EpisodioSinConexion {
  id: string;
  inicio: string;
  fin: string;
}

export interface DatosSinConexion {
  /** Nombre comercial y NIT del negocio, para el encabezado del recibo provisional. */
  negocio: { nombre: string; nit?: string } | null;
  /** SANDBOX: la tirilla sin conexión lleva "DOCUMENTO DE PRUEBA", igual que en línea. */
  ambiente: 'SANDBOX' | 'PRODUCCION' | null;
  emisor: { razonSocial: string; nitConDv: string; direccion: string } | null;
  fabricanteSoftware: string;
  proveedorTecnologico: string;
  resolucion: ResolucionContingencia | null;
}

export interface EstadoContingencia {
  resolucion: ResolucionContingencia | null;
  activa: PeriodoContingencia | null;
  /** Últimos 10, del más reciente al más viejo. */
  periodos: PeriodoContingencia[];
  /** Documentos de contingencia todavía sin aceptar por la DIAN. */
  pendientes: number;
  /** Vencimiento de 48 h más próximo entre los períodos cerrados con pendientes; null si no hay. */
  venceEl: Date | null;
}

/**
 * Contingencia del facturador (fase 6a — spec de unificación de comprobantes, sección 12). La del lado
 * de la DIAN la absorbe Alegra (no expone la factura tipo 04 sin validación previa), así que acá solo
 * existe la del facturador/proveedor: factura de papel con numeración propia y transcripción posterior.
 */
@Injectable()
export class ContingenciaService {
  private readonly logger = new Logger(ContingenciaService.name);

  constructor(
    @InjectRepository(HabilitacionFacturacionElectronica)
    private readonly habilitaciones: Repository<HabilitacionFacturacionElectronica>,
    @InjectRepository(PeriodoContingencia)
    private readonly periodos: Repository<PeriodoContingencia>,
    @InjectRepository(DocumentoElectronico)
    private readonly documentos: Repository<DocumentoElectronico>,
    @InjectRepository(Alerta)
    private readonly alertas: Repository<Alerta>,
    private readonly realtime: RealtimeGateway,
    @InjectRepository(ReservaContingencia)
    private readonly reservas: Repository<ReservaContingencia>,
    @InjectRepository(Negocio)
    private readonly negocios: Repository<Negocio>,
  ) {}

  private async habilitacionOFallar(negocioId: string): Promise<HabilitacionFacturacionElectronica> {
    const habilitacion = await this.habilitaciones.findOne({ where: { negocioId } });
    if (!habilitacion || habilitacion.estado !== EstadoHabilitacion.HABILITADO) {
      throw new BadRequestException('Primero activa la facturación electrónica');
    }
    return habilitacion;
  }

  private tieneResolucion(h: HabilitacionFacturacionElectronica): boolean {
    return !!h.contingenciaResolucionNumero && !!h.contingenciaPrefijo && h.contingenciaRangoDesde != null && h.contingenciaRangoHasta != null;
  }

  async cargarResolucion(negocioId: string, dto: CargarResolucionContingenciaDto): Promise<EstadoContingencia> {
    const habilitacion = await this.habilitacionOFallar(negocioId);
    const prefijo = dto.prefijo.toUpperCase();
    if (prefijo === (habilitacion.resolucionPrefijo ?? '').toUpperCase()) {
      throw new BadRequestException('Usa un prefijo distinto al de la factura electrónica');
    }
    if (dto.rangoHasta < dto.rangoDesde) throw new BadRequestException('El rango final no puede ser menor que el inicial');
    if (dto.fechaFin < dto.fechaInicio) throw new BadRequestException('La fecha final no puede ser anterior a la inicial');
    if (await this.periodoActivo(negocioId)) {
      throw new ConflictException('Termina la contingencia en curso antes de cambiar la resolución');
    }
    const esNueva = habilitacion.contingenciaResolucionNumero !== dto.numero || habilitacion.contingenciaPrefijo !== prefijo;
    habilitacion.contingenciaResolucionNumero = dto.numero;
    habilitacion.contingenciaPrefijo = prefijo;
    habilitacion.contingenciaFechaInicio = dto.fechaInicio.slice(0, 10);
    habilitacion.contingenciaFechaFin = dto.fechaFin.slice(0, 10);
    habilitacion.contingenciaRangoDesde = dto.rangoDesde;
    habilitacion.contingenciaRangoHasta = dto.rangoHasta;
    if (esNueva || habilitacion.contingenciaSiguienteNumero == null) habilitacion.contingenciaSiguienteNumero = dto.rangoDesde;
    await this.habilitaciones.save(habilitacion);
    return this.estado(negocioId);
  }

  async estado(negocioId: string): Promise<EstadoContingencia> {
    const h = await this.habilitaciones.findOne({ where: { negocioId } });
    const resolucion: ResolucionContingencia | null =
      h && this.tieneResolucion(h)
        ? {
            numero: h.contingenciaResolucionNumero!,
            prefijo: h.contingenciaPrefijo!,
            fechaInicio: h.contingenciaFechaInicio!,
            fechaFin: h.contingenciaFechaFin!,
            rangoDesde: h.contingenciaRangoDesde!,
            rangoHasta: h.contingenciaRangoHasta!,
            siguienteNumero: h.contingenciaSiguienteNumero ?? h.contingenciaRangoDesde!,
          }
        : null;
    const periodos = await this.periodos.find({ where: { negocioId }, order: { inicio: 'DESC' }, take: 10 });
    const pendientes = await this.documentos.count({
      where: { negocioId, periodoContingenciaId: Not(IsNull()), estado: Not(In(ESTADOS_ACEPTADOS)) },
    });
    let venceEl: Date | null = null;
    for (const p of periodos) {
      if (!p.fin) continue;
      const sinAceptar = await this.documentos.count({ where: { periodoContingenciaId: p.id, estado: Not(In(ESTADOS_ACEPTADOS)) } });
      if (!sinAceptar) continue;
      const vence = new Date(p.fin.getTime() + PLAZO_TRANSMISION_MS);
      if (!venceEl || vence < venceEl) venceEl = vence;
    }
    return { resolucion, activa: periodos.find((p) => !p.fin) ?? null, periodos, pendientes, venceEl };
  }

  periodoActivo(negocioId: string): Promise<PeriodoContingencia | null> {
    return this.periodos.findOne({ where: { negocioId, fin: IsNull() } });
  }

  async estaAbierto(periodoId: string): Promise<boolean> {
    const periodo = await this.periodos.findOne({ where: { id: periodoId } });
    return !!periodo && !periodo.fin;
  }

  async periodoDelNegocio(negocioId: string, periodoId: string): Promise<PeriodoContingencia> {
    const periodo = await this.periodos.findOne({ where: { id: periodoId, negocioId } });
    if (!periodo) throw new NotFoundException('Período de contingencia no encontrado');
    return periodo;
  }

  async declarar(negocioId: string, usuarioId: string, dto: DeclararContingenciaDto): Promise<PeriodoContingencia> {
    const habilitacion = await this.habilitacionOFallar(negocioId);
    if (!this.tieneResolucion(habilitacion)) {
      throw new BadRequestException('Carga primero la resolución de contingencia autorizada por la DIAN');
    }
    if (await this.periodoActivo(negocioId)) throw new ConflictException('Ya hay una contingencia en curso');
    const inicio = dto.inicio ? new Date(dto.inicio) : new Date();
    if (inicio.getTime() > Date.now()) throw new BadRequestException('El inicio no puede estar en el futuro');
    const ultimo = await this.periodos.findOne({ where: { negocioId }, order: { fin: 'DESC' } });
    if (ultimo?.fin && inicio < ultimo.fin) {
      throw new BadRequestException('El inicio se cruza con la contingencia anterior');
    }
    const periodo = await this.periodos.save(
      this.periodos.create({ negocioId, inicio, fin: null, origen: 'MANUAL', motivo: dto.motivo.trim(), declaradoPor: usuarioId, finalizadoPor: null }),
    );
    this.realtime.emitToNegocio(negocioId, 'contingencia:cambio', periodo);
    return periodo;
  }

  async finalizar(negocioId: string, usuarioId: string | null, dto: FinalizarContingenciaDto = {}): Promise<PeriodoContingencia> {
    const periodo = await this.periodoActivo(negocioId);
    if (!periodo) throw new NotFoundException('No hay una contingencia en curso');
    const fin = dto.fin ? new Date(dto.fin) : new Date();
    if (fin < periodo.inicio) throw new BadRequestException('El fin no puede ser anterior al inicio');
    if (fin.getTime() > Date.now()) throw new BadRequestException('El fin no puede estar en el futuro');
    periodo.fin = fin;
    periodo.finalizadoPor = usuarioId;
    const cerrado = await this.periodos.save(periodo);
    const habilitacion = await this.habilitaciones.findOne({ where: { negocioId } });
    if (habilitacion?.alegraNoDisponibleDesde) {
      habilitacion.alegraNoDisponibleDesde = null;
      await this.habilitaciones.save(habilitacion);
    }
    this.realtime.emitToNegocio(negocioId, 'contingencia:cambio', null);
    return cerrado;
  }

  /** Llamado por `intentarEmitir` ante un `AlegraNoDisponibleError`. Nunca lanza. */
  async registrarIndisponibilidad(habilitacion: HabilitacionFacturacionElectronica): Promise<void> {
    const ahora = new Date();
    if (!habilitacion.alegraNoDisponibleDesde) {
      habilitacion.alegraNoDisponibleDesde = ahora;
      await this.habilitaciones.save(habilitacion);
      return;
    }
    const desde = habilitacion.alegraNoDisponibleDesde;
    if (ahora.getTime() - desde.getTime() < UMBRAL_CONTINGENCIA_AUTOMATICA_MS) return;
    if (!this.tieneResolucion(habilitacion)) {
      this.logger.warn(`Negocio ${habilitacion.negocioId}: Alegra no responde hace más de 5 min y no hay resolución de contingencia`);
      return;
    }
    if (await this.periodoActivo(habilitacion.negocioId)) return;
    try {
      const periodo = await this.periodos.save(
        this.periodos.create({
          negocioId: habilitacion.negocioId, inicio: desde, fin: null, origen: 'AUTOMATICA',
          motivo: 'Alegra/DIAN sin respuesta', declaradoPor: null, finalizadoPor: null,
        }),
      );
      await this.crearAlerta(
        habilitacion.negocioId, periodo.id,
        'Entraste en contingencia de facturación: cada venta sale como factura de papel. Envía la carta de inicio a la DIAN desde Facturación > Contingencia.',
      );
      this.realtime.emitToNegocio(habilitacion.negocioId, 'contingencia:cambio', periodo);
    } catch (error) {
      // Dos ventas simultáneas pueden intentar abrirlo: el índice único parcial deja pasar solo una.
      if (error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === '23505') return;
      throw error;
    }
  }

  async registrarDisponibilidad(habilitacion: HabilitacionFacturacionElectronica): Promise<void> {
    if (!habilitacion.alegraNoDisponibleDesde) return;
    habilitacion.alegraNoDisponibleDesde = null;
    await this.habilitaciones.save(habilitacion);
  }

  /** Siguiente número libre de la resolución de contingencia, con lock de fila (mismo criterio que `NumeracionComprobanteService`). */
  async asignarNumero(negocioId: string): Promise<{ numero: number; habilitacion: HabilitacionFacturacionElectronica }> {
    return this.habilitaciones.manager.transaction(async (manager) => {
      const h = await manager.findOne(HabilitacionFacturacionElectronica, { where: { negocioId }, lock: { mode: 'pessimistic_write' } });
      if (!h || !this.tieneResolucion(h)) throw new BadRequestException('No hay resolución de contingencia cargada');
      let numero = h.contingenciaSiguienteNumero ?? h.contingenciaRangoDesde!;
      while (
        (await manager.count(DocumentoElectronico, {
          where: { negocioId, prefijo: h.contingenciaPrefijo!, numero, periodoContingenciaId: Not(IsNull()) },
        })) > 0
      ) {
        numero += 1;
      }
      if (numero > h.contingenciaRangoHasta!) {
        throw new BadRequestException('Se agotó la numeración de contingencia: solicita un rango nuevo a la DIAN');
      }
      h.contingenciaSiguienteNumero = numero + 1;
      await manager.save(HabilitacionFacturacionElectronica, h);
      return { numero, habilitacion: h };
    });
  }

  async validarTalonario(negocioId: string, numero: number, fecha: Date): Promise<PeriodoContingencia> {
    const h = await this.habilitacionOFallar(negocioId);
    if (!this.tieneResolucion(h)) throw new BadRequestException('Carga primero la resolución de contingencia');
    if (numero < h.contingenciaRangoDesde! || numero > h.contingenciaRangoHasta!) {
      throw new BadRequestException(`El número está fuera del rango autorizado (${h.contingenciaRangoDesde}–${h.contingenciaRangoHasta})`);
    }
    if (fecha.getTime() > Date.now()) throw new BadRequestException('La fecha de la factura no puede estar en el futuro');
    const usado = await this.documentos.count({
      where: { negocioId, prefijo: h.contingenciaPrefijo!, numero, periodoContingenciaId: Not(IsNull()) },
    });
    if (usado) throw new ConflictException('Ese número de contingencia ya está registrado');
    const periodo = await this.periodos.findOne({
      where: [
        { negocioId, inicio: LessThanOrEqual(fecha), fin: IsNull() },
        { negocioId, inicio: LessThanOrEqual(fecha), fin: MoreThanOrEqual(fecha) },
      ],
    });
    if (!periodo) {
      throw new BadRequestException('La fecha no cae en ningún período de contingencia. Declara el período primero (puedes poner un inicio pasado).');
    }
    return periodo;
  }

  async marcarAviso(negocioId: string, periodoId: string, tipo: 'INICIO' | 'FIN'): Promise<PeriodoContingencia> {
    const periodo = await this.periodoDelNegocio(negocioId, periodoId);
    if (tipo === 'FIN' && !periodo.fin) throw new BadRequestException('La contingencia todavía no termina');
    if (tipo === 'INICIO') periodo.avisoInicioEn = new Date();
    else periodo.avisoFinEn = new Date();
    return this.periodos.save(periodo);
  }

  /**
   * Fase 6b: reserva un bloque para una caja. Avanza el consecutivo de la habilitación más allá del
   * bloque, así ni el backend ni otra caja usan esos números.
   */
  async reservarBloque(
    negocioId: string,
    terminalId: string,
    cantidad = TAMANO_BLOQUE_CONTINGENCIA,
  ): Promise<BloqueContingencia> {
    return this.habilitaciones.manager.transaction(async (manager) => {
      const h = await manager.findOne(HabilitacionFacturacionElectronica, {
        where: { negocioId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!h || !this.tieneResolucion(h)) throw new BadRequestException('No hay resolución de contingencia cargada');
      const desde = h.contingenciaSiguienteNumero ?? h.contingenciaRangoDesde!;
      if (desde > h.contingenciaRangoHasta!) {
        throw new BadRequestException('Se agotó la numeración de contingencia: solicita un rango nuevo a la DIAN');
      }
      const hasta = Math.min(desde + cantidad - 1, h.contingenciaRangoHasta!);
      h.contingenciaSiguienteNumero = hasta + 1;
      await manager.save(HabilitacionFacturacionElectronica, h);
      const resolucion: ResolucionContingenciaSnapshot = {
        numero: h.contingenciaResolucionNumero!,
        prefijo: h.contingenciaPrefijo!,
        fechaInicio: h.contingenciaFechaInicio!,
        fechaFin: h.contingenciaFechaFin!,
        rangoDesde: h.contingenciaRangoDesde!,
        rangoHasta: h.contingenciaRangoHasta!,
      };
      await manager.save(
        ReservaContingencia,
        this.reservas.create({
          negocioId,
          terminalId,
          desde,
          hasta,
          resolucionNumero: resolucion.numero,
          prefijo: resolucion.prefijo,
          fechaInicio: resolucion.fechaInicio,
          fechaFin: resolucion.fechaFin,
          rangoDesde: resolucion.rangoDesde,
          rangoHasta: resolucion.rangoHasta,
        }),
      );
      return { desde, hasta, resolucion };
    });
  }

  /** Fase 6b: el período de contingencia de un episodio sin conexión de una caja (idempotente por episodio). */
  async asegurarPeriodoSinConexion(negocioId: string, episodio: EpisodioSinConexion): Promise<PeriodoContingencia> {
    const propio = await this.periodos.findOne({ where: { negocioId, episodioId: episodio.id } });
    if (propio) return propio;
    const inicio = new Date(episodio.inicio);
    const fin = new Date(episodio.fin);
    const cubre = await this.periodos.findOne({
      where: [
        { negocioId, inicio: LessThanOrEqual(inicio), fin: IsNull() },
        { negocioId, inicio: LessThanOrEqual(inicio), fin: MoreThanOrEqual(fin) },
      ],
    });
    if (cubre) return cubre;
    const periodo = await this.periodos.save(
      this.periodos.create({
        negocioId,
        inicio,
        fin,
        origen: 'SIN_CONEXION',
        motivo: 'Sin conexión a internet en la caja',
        declaradoPor: null,
        finalizadoPor: null,
        episodioId: episodio.id,
      }),
    );
    await this.crearAlerta(
      negocioId,
      periodo.id,
      'Una caja vendió sin conexión a internet (contingencia). Descarga y envía las cartas de inicio y fin a la DIAN desde Facturación > Contingencia.',
    );
    this.realtime.emitToNegocio(negocioId, 'contingencia:cambio', null);
    return periodo;
  }

  /** Fase 6b: lo que la caja necesita para imprimir una factura de papel sin conexión (la guarda en su foto). */
  async datosSinConexion(negocioId: string): Promise<DatosSinConexion> {
    const h = await this.habilitaciones.findOne({ where: { negocioId } });
    const negocio = await this.negocios.findOne({ where: { id: negocioId } });
    const estado = await this.estado(negocioId);
    return {
      negocio: negocio ? { nombre: negocio.nombre, nit: negocio.nit ?? undefined } : null,
      ambiente: h?.ambiente ?? null,
      // El emisor es siempre el negocio, nunca AURA.
      emisor: negocio
        ? {
            razonSocial: h?.razonSocial ?? negocio.nombre,
            nitConDv: nitConDv(negocio.nit),
            direccion: [h?.direccion ?? negocio.direccion, h?.ciudad ?? negocio.ciudadNombre].filter(Boolean).join(', '),
          }
        : null,
      fabricanteSoftware: fabricanteSoftware(),
      proveedorTecnologico: PROVEEDOR_TECNOLOGICO,
      resolucion: estado.resolucion,
    };
  }

  periodosAutomaticosAbiertos(): Promise<PeriodoContingencia[]> {
    return this.periodos.find({ where: { origen: 'AUTOMATICA', fin: IsNull() } });
  }

  /** Cron horario: períodos cerrados hace más de 24 h con facturas sin aceptar → alerta crítica (una por período). */
  async alertarPlazos(): Promise<void> {
    const corte = new Date(Date.now() - AVISO_PLAZO_MS);
    const cerrados = await this.periodos.find({ where: { fin: LessThanOrEqual(corte) } });
    for (const periodo of cerrados) {
      const sinAceptar = await this.documentos.count({
        where: { periodoContingenciaId: periodo.id, estado: Not(In(ESTADOS_ACEPTADOS)) },
      });
      if (!sinAceptar) continue;
      const vence = new Date(periodo.fin!.getTime() + PLAZO_TRANSMISION_MS);
      await this.crearAlerta(
        periodo.negocioId, periodo.id,
        `${sinAceptar} factura(s) de contingencia siguen sin aceptar por la DIAN. El plazo para transmitirlas vence el ${vence.toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
      );
    }
  }

  private async crearAlerta(negocioId: string, periodoId: string, mensaje: string): Promise<void> {
    const existente = await this.alertas.findOne({
      where: { negocioId, tipo: TipoAlerta.CONTINGENCIA_FACTURACION, referenciaId: periodoId, resuelta: false },
    });
    const alerta = existente
      ? await this.alertas.save({ ...existente, mensaje })
      : await this.alertas.save(
          this.alertas.create({ negocioId, tipo: TipoAlerta.CONTINGENCIA_FACTURACION, referenciaId: periodoId, severidad: SeveridadAlerta.CRITICA, mensaje }),
        );
    this.realtime.emitToNegocio(negocioId, 'alertas:cambio', alerta);
  }
}
