import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { Alerta } from '../alertas/entities/alerta.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import {
  OrigenObligacion,
  ResponsabilidadIva,
  TipoPersona,
} from '../negocios/entities/perfil-fiscal.enum';
import { TipoAlerta, SeveridadAlerta } from '../common/enums/alerta.enum';
import { EstadoVenta } from '../common/enums/venta.enum';
import {
  diaColombia,
  finDiaColombia,
  inicioDiaColombia,
} from '../common/utils/fecha-colombia';
import { EmailService } from '../email/email.service';
import { construirAvisoTopeFacturacion } from '../email/templates/tope-facturacion.template';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PoliticaFacturacionService } from './politica-facturacion.service';
import {
  decidirAccionTope,
  evaluarTope,
  IngresosAnio,
  MedicionTope,
} from './tope-uvt.logic';

const SEVERIDAD_POR_NIVEL = {
  70: SeveridadAlerta.MEDIA,
  90: SeveridadAlerta.ALTA,
  100: SeveridadAlerta.CRITICA,
} as const;

/**
 * Vigila el tope de 3.500 UVT de los negocios que declararon no estar obligados a facturar (spec de
 * unificación de comprobantes, 4.3). El número es un mínimo: AURA no ve ventas por fuera del sistema,
 * consignaciones ni otros locales — los avisos lo dicen.
 */
@Injectable()
export class TopeUvtService {
  private readonly logger = new Logger(TopeUvtService.name);

  constructor(
    @InjectRepository(Negocio) private readonly negocios: Repository<Negocio>,
    @InjectRepository(Venta) private readonly ventas: Repository<Venta>,
    @InjectRepository(Alerta) private readonly alertas: Repository<Alerta>,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    private readonly politica: PoliticaFacturacionService,
    private readonly emailService: EmailService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async evaluarTodos(ahora: Date = new Date()): Promise<void> {
    const candidatos = await this.negocios.find({
      where: {
        activo: true,
        tipoPersona: TipoPersona.NATURAL,
        responsabilidadIva: ResponsabilidadIva.NO_RESPONSABLE,
      },
    });
    for (const negocio of candidatos) {
      // Un negocio con error no deja sin evaluar a los que vienen después esa noche.
      try {
        await this.evaluarNegocio(negocio, ahora);
      } catch (error) {
        this.logger.error(
          `Error evaluando el tope de UVT del negocio ${negocio.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  async evaluarNegocio(negocio: Negocio, ahora: Date): Promise<void> {
    const anioActual = Number(diaColombia(ahora).slice(0, 4));
    const { medicion, aniosSinUvt } = evaluarTope(
      await this.ingresosPorAnio(negocio.id, anioActual),
    );
    for (const anio of aniosSinUvt) {
      this.logger.warn(
        `Sin valor de UVT para ${anio} en uvt.ts: ese año no se evalúa (negocio ${negocio.id})`,
      );
    }
    if (!medicion) return;

    const accion = decidirAccionTope(negocio, medicion.nivel, anioActual);
    switch (accion.tipo) {
      case 'NADA':
        return;
      case 'LIMPIAR_OBLIGACION':
        negocio.obligadoDesde = null;
        negocio.origenObligacion = null;
        await this.negocios.save(negocio);
        this.realtime.emitToNegocio(
          negocio.id,
          'politica-facturacion:cambio',
          {},
        );
        return;
      case 'AVISAR':
        negocio.avisoTopeUvtNivel = accion.nivel;
        negocio.avisoTopeUvtAnio = anioActual;
        await this.negocios.save(negocio);
        await this.avisar(negocio, medicion, accion.nivel);
        return;
      case 'MARCAR_OBLIGADO':
        // La obligación se guarda primero: es lo que arranca la gracia; el aviso es best-effort.
        negocio.obligadoDesde = ahora;
        negocio.origenObligacion = OrigenObligacion.TOPE_UVT;
        negocio.avisoTopeUvtNivel = 100;
        negocio.avisoTopeUvtAnio = anioActual;
        await this.negocios.save(negocio);
        this.realtime.emitToNegocio(
          negocio.id,
          'politica-facturacion:cambio',
          {},
        );
        if (accion.avisar) await this.avisar(negocio, medicion, 100);
        return;
    }
  }

  /**
   * `created_at` es timestamp sin zona en UTC; los límites salen de fecha-colombia y `pg-utc.ts`
   * los manda en UTC — mismo criterio que los rangos de reportes.
   */
  private async ingresosPorAnio(
    negocioId: string,
    anioActual: number,
  ): Promise<IngresosAnio[]> {
    const anioAnterior = anioActual - 1;
    // Postgres devuelve los numeric como string.
    const filas: { actual: string; anterior: string }[] =
      await this.ventas.query(
        `SELECT
         COALESCE(SUM(CASE WHEN v.created_at >= $3 THEN v.total - v.impuesto_total ELSE 0 END), 0) AS actual,
         COALESCE(SUM(CASE WHEN v.created_at < $3 THEN v.total - v.impuesto_total ELSE 0 END), 0) AS anterior
       FROM ventas v
       WHERE v.negocio_id = $1
         AND v.estado <> $2
         AND v.created_at BETWEEN $4 AND $5`,
        [
          negocioId,
          EstadoVenta.CANCELADA,
          inicioDiaColombia(`${anioActual}-01-01`),
          inicioDiaColombia(`${anioAnterior}-01-01`),
          finDiaColombia(`${anioActual}-12-31`),
        ],
      );
    const fila = filas[0];
    return [
      { anio: anioActual, ingresos: Number(fila?.actual ?? 0) },
      { anio: anioAnterior, ingresos: Number(fila?.anterior ?? 0) },
    ];
  }

  private async avisar(
    negocio: Negocio,
    medicion: MedicionTope,
    nivel: 70 | 90 | 100,
  ): Promise<void> {
    try {
      const estado =
        nivel === 100 ? await this.politica.estado(negocio.id) : null;
      const yaFacturaElectronica = estado?.modo === 'ELECTRONICA';
      const { subject, html, mensajeAlerta } = construirAvisoTopeFacturacion({
        nivel,
        anio: medicion.anio,
        ingresos: medicion.ingresos,
        tope: medicion.tope,
        porcentaje: medicion.porcentaje,
        yaFacturaElectronica,
        fechaLimiteGracia: estado?.fechaLimiteGracia ?? null,
        linkFacturacion: `${process.env.FRONTEND_URL}/configuracion/facturacion-electronica`,
      });

      const severidad =
        nivel === 100 && yaFacturaElectronica
          ? SeveridadAlerta.MEDIA
          : SEVERIDAD_POR_NIVEL[nivel];
      // Referencia = año en que AURA avisó (evaluarNegocio ya lo fijó); el mensaje dice de qué año son las ventas.
      await this.crearOActualizarAlerta(
        negocio.id,
        String(negocio.avisoTopeUvtAnio),
        severidad,
        mensajeAlerta,
      );

      const admin = await this.usuarios.findOne({
        where: { negocioId: negocio.id, activo: true },
        order: { createdAt: 'ASC' },
      });
      if (admin)
        await this.emailService.enviar({ to: admin.email, subject, html });
    } catch (error) {
      this.logger.error(
        `Error avisando el tope de UVT al negocio ${negocio.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Mismo criterio que `SuscripcionesService.crearOActualizarAlerta`: una alerta viva por tipo + referencia (el año). */
  private async crearOActualizarAlerta(
    negocioId: string,
    referenciaId: string,
    severidad: SeveridadAlerta,
    mensaje: string,
  ): Promise<void> {
    const existente = await this.alertas.findOne({
      where: {
        negocioId,
        tipo: TipoAlerta.TOPE_FACTURACION,
        referenciaId,
        resuelta: false,
      },
    });
    if (existente) {
      existente.severidad = severidad;
      existente.mensaje = mensaje;
      const actualizada = await this.alertas.save(existente);
      this.realtime.emitToNegocio(negocioId, 'alertas:cambio', actualizada);
      return;
    }
    const creada = await this.alertas.save(
      this.alertas.create({
        negocioId,
        tipo: TipoAlerta.TOPE_FACTURACION,
        referenciaId,
        severidad,
        mensaje,
      }),
    );
    this.realtime.emitToNegocio(negocioId, 'alertas:cambio', creada);
  }
}
