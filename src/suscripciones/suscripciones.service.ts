import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { Suscripcion } from './entities/suscripcion.entity';
import { EstadoSuscripcion } from './entities/estado-suscripcion.enum';
import { TransaccionSuscripcion, MetodoPagoSuscripcion } from './entities/transaccion-suscripcion.entity';
import { WompiClientService } from '../pagos/wompi-client.service';
import { PaquetesService } from '../paquetes/paquetes.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ReactivarSuscripcionDto } from './dto/reactivar-suscripcion.dto';

const DIAS_PRUEBA = 20;

const WOMPI_PAYMENT_TYPE: Record<MetodoPagoSuscripcion, string> = {
  QR: 'BANCOLOMBIA_QR',
  NEQUI: 'NEQUI',
  PSE: 'PSE',
  TARJETA: 'CARD',
};

@Injectable()
export class SuscripcionesService {
  constructor(
    @InjectRepository(Suscripcion)
    private readonly suscripcionesRepository: Repository<Suscripcion>,
    @InjectRepository(TransaccionSuscripcion)
    private readonly transaccionesRepository: Repository<TransaccionSuscripcion>,
    private readonly wompiClient: WompiClientService,
    private readonly paquetesService: PaquetesService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async crearSuscripcionPrueba(negocioId: string, paqueteId: string): Promise<Suscripcion> {
    const fechaInicio = new Date();
    const fechaFin = new Date(fechaInicio);
    fechaFin.setDate(fechaFin.getDate() + DIAS_PRUEBA);

    return this.suscripcionesRepository.save(
      this.suscripcionesRepository.create({
        negocioId,
        paqueteId,
        estado: EstadoSuscripcion.PRUEBA,
        fechaInicio,
        fechaFin,
      }),
    );
  }

  /** Negocios creados por rol SISTEMA — nunca pasan por la prueba de 20 días. */
  async crearSuscripcionSinVencimiento(negocioId: string, paqueteId: string): Promise<Suscripcion> {
    return this.suscripcionesRepository.save(
      this.suscripcionesRepository.create({
        negocioId,
        paqueteId,
        estado: EstadoSuscripcion.ACTIVA,
        fechaInicio: new Date(),
        fechaFin: null,
      }),
    );
  }

  /** Fail-closed: sin Suscripcion, o VENCIDA, el negocio está bloqueado. */
  /**
   * No confía únicamente en `estado === VENCIDA` — ese campo solo lo escribe
   * el cron (`marcarVencidas()`, corre cada hora). Si el scheduler no corre
   * por cualquier motivo, una PRUEBA/ACTIVA con `fechaFin` ya pasada seguiría
   * dando acceso indefinido sin esta segunda condición — el paywall completo
   * dependería de que un job en segundo plano nunca falle, lo cual contradice
   * el fail-closed que exige el spec. Peor caso sin esto: hasta 1h de acceso
   * gratis extra (tolerable); sin el chequeo, potencialmente indefinido.
   */
  async estaBloqueado(negocioId: string): Promise<boolean> {
    const suscripcion = await this.suscripcionesRepository.findOne({ where: { negocioId } });
    if (!suscripcion) return true;
    if (suscripcion.estado === EstadoSuscripcion.VENCIDA) return true;
    return suscripcion.fechaFin !== null && suscripcion.fechaFin < new Date();
  }

  async miEstado(negocioId: string): Promise<Suscripcion> {
    const suscripcion = await this.suscripcionesRepository.findOne({
      where: { negocioId },
      relations: { paquete: true },
    });
    if (!suscripcion) {
      throw new NotFoundException(`El negocio ${negocioId} no tiene una suscripción`);
    }
    return suscripcion;
  }

  async iniciarReactivacion(negocioId: string, dto: ReactivarSuscripcionDto) {
    // Idempotencia acotada en el tiempo: sin este chequeo, dos clics del cajero (o un reintento
    // del frontend tras un timeout) crean dos transacciones distintas en Wompi — dos cobros
    // reales por la misma reactivación. Se bloquea solo mientras la última PENDIENTE sea
    // "reciente" (mismo criterio que usa `reconciliarPendientes` para considerar una transacción
    // todavía viva) — pasada esa ventana se asume abandonada (QR nunca escaneado) y se permite
    // generar una nueva, para no dejar a un negocio bloqueado para siempre por un intento viejo
    // que nunca se completó.
    const VENTANA_PENDIENTE_MS = 10 * 60 * 1000;
    const pendiente = await this.transaccionesRepository.findOne({
      where: { negocioId, estado: 'PENDIENTE' },
      order: { createdAt: 'DESC' },
    });
    if (pendiente && pendiente.createdAt.getTime() > Date.now() - VENTANA_PENDIENTE_MS) {
      throw new BadRequestException(
        'Ya hay un pago de reactivación en curso — esperá a que se confirme antes de intentar de nuevo',
      );
    }

    const suscripcion = await this.miEstado(negocioId);
    const paqueteId = dto.paqueteId ?? suscripcion.paqueteId;
    const paquete = await this.paquetesService.findOne(paqueteId);

    const llavePublica = process.env.WOMPI_PLATAFORMA_LLAVE_PUBLICA!;
    const llavePrivada = process.env.WOMPI_PLATAFORMA_LLAVE_PRIVADA!;
    const llaveIntegridad = process.env.WOMPI_PLATAFORMA_LLAVE_INTEGRIDAD!;

    const { acceptanceToken, acceptPersonalAuth } =
      await this.wompiClient.obtenerTokensAceptacion(llavePublica);

    const montoEnCentavos = Math.round(Number(paquete.precioMensual) * 100);
    const wompiType = WOMPI_PAYMENT_TYPE[dto.metodo];
    const requierePaymentDescription = wompiType === 'BANCOLOMBIA_QR' || wompiType === 'PSE';
    const paymentMethod = {
      ...(requierePaymentDescription ? { payment_description: `Suscripción AURA — ${paquete.nombre}` } : {}),
      ...dto.datosMetodo,
      type: wompiType,
    };

    const referencia = randomUUID();
    const currency = 'COP';
    const signature = createHash('sha256')
      .update(`${referencia}${montoEnCentavos}${currency}${llaveIntegridad}`)
      .digest('hex');

    const { wompiTransactionId, status, extra: extraInicial } = await this.wompiClient.crearTransaccion({
      llavePrivada,
      amountInCents: montoEnCentavos,
      currency,
      reference: referencia,
      signature,
      acceptanceToken,
      acceptPersonalAuth,
      paymentMethod,
      customerEmail: 'facturacion@somosaura.dev',
    });

    // Wompi no manda `qr_image` en la respuesta de POST /transactions para
    // BANCOLOMBIA_QR — se genera async y solo aparece consultando
    // GET /transactions/{id} un rato después. Mismo bug y mismo fix que
    // PagosService.iniciarPago/esperarQrImagen (ver ese archivo): sin este
    // polling, el frontend siempre recibía `extra` vacío y no podía mostrar
    // ningún QR para pagar.
    const extra =
      wompiType === 'BANCOLOMBIA_QR' && !extraInicial?.['qr_image']
        ? await this.esperarQrImagen(wompiTransactionId, llavePublica)
        : extraInicial;

    await this.transaccionesRepository.save(
      this.transaccionesRepository.create({
        negocioId,
        paqueteId,
        referencia,
        wompiTransactionId,
        metodoPago: dto.metodo,
        estado: status === 'APPROVED' ? 'APROBADA' : 'PENDIENTE',
        montoEnCentavos,
      }),
    );

    if (status === 'APPROVED') {
      await this.activarTrasPago(negocioId, paqueteId);
    }

    return { referencia, wompiTransactionId, extra };
  }

  /**
   * Polling corto (no long-polling real) contra `GET /transactions/{id}` hasta que Wompi termine de
   * generar el QR o se agote el presupuesto de tiempo — mismo método, mismos parámetros, que
   * `PagosService.esperarQrImagen` (`pos-backend/src/pagos/pagos.service.ts`), copiado acá en vez de
   * extraído a un helper compartido porque `PagosService` es tenant-scoped (usa credenciales por
   * negocio) y este servicio usa las credenciales de la PLATAFORMA — mismo algoritmo, distinto
   * origen de credenciales, no vale la pena forzar una abstracción compartida para eso.
   */
  private async esperarQrImagen(
    wompiTransactionId: string,
    llavePublica: string,
  ): Promise<Record<string, unknown> | undefined> {
    const INTENTOS = 8;
    const ESPERA_MS = 500;
    let extra: Record<string, unknown> | undefined;
    for (let intento = 0; intento < INTENTOS; intento++) {
      await new Promise((resolve) => setTimeout(resolve, ESPERA_MS));
      const resultado = await this.wompiClient.obtenerTransaccion(wompiTransactionId, llavePublica);
      extra = resultado.extra;
      if (extra?.['qr_image']) break;
    }
    return extra;
  }

  /** Mismo patrón de verificación que `PagosService.procesarWebhook` — checksum SHA256 sobre las properties firmadas + timestamp + secreto, comparación a tiempo constante. */
  async procesarWebhookWompi(payload: {
    event: string;
    data: Record<string, Record<string, unknown>>;
    signature: { properties: string[]; checksum: string };
    timestamp: number;
  }): Promise<void> {
    if (payload?.event !== 'transaction.updated') return;

    const referencia = payload.data?.transaction?.reference as string | undefined;
    if (!referencia) return;

    const transaccion = await this.transaccionesRepository.findOne({ where: { referencia } });
    if (!transaccion || transaccion.estado !== 'PENDIENTE') return;

    const secreto = process.env.WOMPI_PLATAFORMA_LLAVE_SECRETA_EVENTOS;
    // Sin esto, `secreto` es `undefined`, la concatenación produce la cadena
    // literal "undefined" (conocida por cualquiera), y un checksum forjado
    // con ese "secreto" pasa la verificación — un webhook falso podía activar
    // una suscripción de 30 días sin ningún pago real. Bug de seguridad real
    // encontrado en la revisión final de rama, probado en vivo contra el
    // endpoint público antes de este fix.
    if (!secreto) return;
    const properties = payload.signature?.properties;
    if (!Array.isArray(properties) || !properties.includes('transaction.id') || !properties.includes('transaction.status')) {
      return;
    }

    let checksumEsperado: string;
    try {
      const valores = properties.map((prop) => {
        const [entidad, campo] = prop.split('.');
        return payload.data?.[entidad]?.[campo];
      });
      checksumEsperado = createHash('sha256').update(valores.join('') + payload.timestamp + secreto).digest('hex');
    } catch {
      return;
    }

    const checksumRecibido = payload.signature?.checksum;
    if (typeof checksumRecibido !== 'string') return;
    const bufEsperado = Buffer.from(checksumEsperado.toLowerCase(), 'hex');
    const bufRecibido = Buffer.from(checksumRecibido.toLowerCase(), 'hex');
    if (bufEsperado.length !== bufRecibido.length || !timingSafeEqual(bufEsperado, bufRecibido)) return;

    const transactionId = payload.data.transaction.id as string;
    if (transaccion.wompiTransactionId && transactionId !== transaccion.wompiTransactionId) return;

    const status = payload.data.transaction.status as string;
    if (status !== 'APPROVED' && status !== 'DECLINED') return;

    transaccion.estado = status === 'APPROVED' ? 'APROBADA' : 'DECLINADA';
    transaccion.confirmedAt = new Date();
    await this.transaccionesRepository.save(transaccion);

    if (status === 'APPROVED') {
      await this.activarTrasPago(transaccion.negocioId, transaccion.paqueteId);
    } else {
      // Mismo motivo que el fix ya aplicado en PagosService.resolverTransaccionTerminal: sin avisar
      // también el rechazo, el frontend queda esperando para siempre un evento que nunca llega.
      this.realtimeGateway.emitToNegocio(transaccion.negocioId, 'suscripcion:pago-declinado', {
        referencia: transaccion.referencia,
      });
    }
  }

  /** Respaldo por polling — mismo motivo que `PagosService.reconciliarPendientes` (el webhook puede no llegar nunca). */
  async reconciliarPendientes(): Promise<void> {
    const llavePublica = process.env.WOMPI_PLATAFORMA_LLAVE_PUBLICA!;
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
    const pendientes = await this.transaccionesRepository.find({ where: { estado: 'PENDIENTE' } });

    for (const transaccion of pendientes) {
      if (!transaccion.wompiTransactionId || transaccion.createdAt < haceUnaHora) continue;

      const { status } = await this.wompiClient.obtenerTransaccion(transaccion.wompiTransactionId, llavePublica);
      if (status !== 'APPROVED' && status !== 'DECLINED') continue;

      const actual = await this.transaccionesRepository.findOne({ where: { id: transaccion.id } });
      if (!actual || actual.estado !== 'PENDIENTE') continue;

      actual.estado = status === 'APPROVED' ? 'APROBADA' : 'DECLINADA';
      actual.confirmedAt = new Date();
      await this.transaccionesRepository.save(actual);

      if (status === 'APPROVED') {
        await this.activarTrasPago(actual.negocioId, actual.paqueteId);
      } else {
        this.realtimeGateway.emitToNegocio(actual.negocioId, 'suscripcion:pago-declinado', {
          referencia: actual.referencia,
        });
      }
    }
  }

  /**
   * ACTIVA con fechaFin = ahora + 30 días — comparte lógica entre el camino síncrono (aprobación
   * inmediata), el webhook, y el polling de respaldo. Avisa por realtime (mismo canal genérico que
   * ya usan Alertas/Domicilios/Pagos — ver RealtimeGateway) para que el frontend, que quedó
   * esperando en la pantalla de reactivación, se entere apenas se aprueba sin tener que adivinar
   * cuándo volver a preguntar.
   */
  private async activarTrasPago(negocioId: string, paqueteId: string): Promise<void> {
    const suscripcion = await this.suscripcionesRepository.findOne({ where: { negocioId } });
    if (!suscripcion) throw new BadRequestException(`Negocio ${negocioId} sin suscripción — no se puede activar`);

    // Extiende desde la fecha MÁS TARDÍA entre ahora y el vencimiento actual — no desde `now()`
    // a secas. Un negocio todavía ACTIVA que renueva/cambia de plan antes de vencer no debe
    // perder los días que ya pagó y le quedaban; uno VENCIDA (o sin fechaFin) simplemente cuenta
    // los 30 días desde hoy, que es el caso `Math.max` cubre solo comparando contra `ahora`.
    const ahora = new Date();
    const base = suscripcion.fechaFin && suscripcion.fechaFin > ahora ? suscripcion.fechaFin : ahora;
    const fechaFin = new Date(base);
    fechaFin.setDate(fechaFin.getDate() + 30);

    suscripcion.paqueteId = paqueteId;
    suscripcion.estado = EstadoSuscripcion.ACTIVA;
    suscripcion.fechaFin = fechaFin;
    await this.suscripcionesRepository.save(suscripcion);

    this.realtimeGateway.emitToNegocio(negocioId, 'suscripcion:cambio', { estado: EstadoSuscripcion.ACTIVA });
  }

  /** Corrida periódica (ver SuscripcionesCronService): PRUEBA/ACTIVA vencidas pasan a VENCIDA. */
  async marcarVencidas(): Promise<void> {
    const ahora = new Date();
    await this.suscripcionesRepository
      .createQueryBuilder()
      .update(Suscripcion)
      .set({ estado: EstadoSuscripcion.VENCIDA })
      .where('estado IN (:...estados)', { estados: [EstadoSuscripcion.PRUEBA, EstadoSuscripcion.ACTIVA] })
      .andWhere('fecha_fin IS NOT NULL AND fecha_fin < :ahora', { ahora })
      .execute();
  }
}
