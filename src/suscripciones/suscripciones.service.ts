import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { Suscripcion } from './entities/suscripcion.entity';
import { EstadoSuscripcion } from './entities/estado-suscripcion.enum';
import { TransaccionSuscripcion, MetodoPagoSuscripcion } from './entities/transaccion-suscripcion.entity';
import { MedioPagoGuardado } from './entities/medio-pago-guardado.entity';
import { Negocio } from '../negocios/entities/negocio.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Alerta } from '../alertas/entities/alerta.entity';
import { TipoAlerta, SeveridadAlerta } from '../common/enums/alerta.enum';
import { WompiClientService } from '../pagos/wompi-client.service';
import { PaquetesService } from '../paquetes/paquetes.service';
import { Paquete } from '../paquetes/entities/paquete.entity';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { EmailService } from '../email/email.service';
import { ReactivarSuscripcionDto } from './dto/reactivar-suscripcion.dto';
import { construirCorreoRecordatorioProximo } from '../email/templates/recordatorio-proximo-cobro.template';
import { construirCorreoRecordatorioDia0 } from '../email/templates/recordatorio-dia-cobro.template';
import { construirCorreoCobroFallido } from '../email/templates/cobro-fallido.template';

const DIAS_PRUEBA = 20;

const WOMPI_PAYMENT_TYPE: Record<MetodoPagoSuscripcion, string> = {
  QR: 'BANCOLOMBIA_QR',
  NEQUI: 'NEQUI',
  PSE: 'PSE',
  TARJETA: 'CARD',
};

@Injectable()
export class SuscripcionesService {
  private readonly logger = new Logger(SuscripcionesService.name);

  constructor(
    @InjectRepository(Suscripcion)
    private readonly suscripcionesRepository: Repository<Suscripcion>,
    @InjectRepository(TransaccionSuscripcion)
    private readonly transaccionesRepository: Repository<TransaccionSuscripcion>,
    @InjectRepository(MedioPagoGuardado)
    private readonly medioPagoRepository: Repository<MedioPagoGuardado>,
    @InjectRepository(Negocio)
    private readonly negociosRepository: Repository<Negocio>,
    @InjectRepository(Usuario)
    private readonly usuariosRepository: Repository<Usuario>,
    @InjectRepository(Alerta)
    private readonly alertasRepository: Repository<Alerta>,
    private readonly wompiClient: WompiClientService,
    private readonly paquetesService: PaquetesService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly emailService: EmailService,
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

  /**
   * Fail-closed: sin Suscripcion, o VENCIDA, el negocio está bloqueado. Tampoco confía
   * únicamente en `estado === VENCIDA` — ese campo solo lo escribe
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
    // Idempotencia acotada en el tiempo: sin este chequeo, un reintento del frontend (ej. recargar
    // la página y volver a apretar el botón) crea una transacción nueva en Wompi por la misma
    // reactivación — el botón ya queda deshabilitado del lado del frontend mientras la request
    // está en curso (`[disabled]="loading()"` en ds-button), así que esto cubre el caso de
    // reintento tras cerrar/recargar, no un verdadero doble-click. Ventana de 10 minutos —
    // deliberadamente DISTINTA a la hora que usa `reconciliarPendientes` para considerar una
    // transacción viva (esa es la ventana de "todavía puede resolverse sola"; esta es la de
    // "cuánto esperamos antes de ofrecer generar un QR nuevo") — aproxima la vida útil típica de
    // un QR de Bancolombia. Pasada esa ventana se asume abandonada y se permite un intento nuevo,
    // para no dejar a un negocio bloqueado para siempre por un QR que nunca se escaneó.
    //
    // Nota conocida (no cerrada acá, ver hallazgo de la revisión): esto no elimina la carrera
    // entre dos requests genuinamente concurrentes (dos pestañas/sesiones a la vez) — cada
    // `iniciarReactivacion` genera su propia `referencia` (randomUUID), así que ni el índice
    // único de `referencia` ni la idempotencia de Wompi las deduplican. El fix de raíz sería un
    // índice único parcial `(negocio_id) WHERE estado='PENDIENTE'` a nivel de esquema.
    // El chequeo compara contra el reloj de la PROPIA base de datos (`now()` en SQL), no contra
    // `Date.now()` de Node — `created_at` es un `timestamp` SIN zona horaria (`@CreateDateColumn`
    // sin `type: 'timestamptz'`, ver BaseEntity), así que `pg` lo parsea como hora LOCAL del
    // proceso Node al traerlo a JS. En un servidor corriendo en `America/Bogota` (UTC-5) contra
    // una DB en UTC, comparar ese `Date` contra `Date.now()` corre la ventana real a ~5h10m en vez
    // de 10 minutos — bug real encontrado en la revisión final (medido en vivo: una transacción de
    // 5h05m de antigüedad real todavía bloqueaba, una de 5h20m ya no). Todo el cálculo de "cuánto
    // hace" se resuelve en SQL para no depender de en qué zona horaria corra el proceso de Node.
    const pendiente = await this.transaccionesRepository
      .createQueryBuilder('t')
      .where('t.negocio_id = :negocioId', { negocioId })
      .andWhere('t.estado = :estado', { estado: 'PENDIENTE' })
      .andWhere("t.created_at > now() - interval '10 minutes'")
      .getOne();
    if (pendiente) {
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
    const referencia = randomUUID();
    const currency = 'COP';
    const signature = createHash('sha256')
      .update(`${referencia}${montoEnCentavos}${currency}${llaveIntegridad}`)
      .digest('hex');

    const debeGuardarTarjeta = !!dto.guardarTarjeta && dto.metodo === 'TARJETA';
    let wompiTransactionId: string;
    let status: string;
    let extra: Record<string, unknown> | undefined;
    let paymentSourceIdCreado: number | undefined;

    if (debeGuardarTarjeta) {
      const token = dto.datosMetodo['token'] as string | undefined;
      if (!token) {
        throw new BadRequestException('Falta el token de tarjeta en datosMetodo para guardar la tarjeta');
      }
      if (!dto.ultimosCuatroDigitos) {
        throw new BadRequestException('Falta ultimosCuatroDigitos para guardar la tarjeta');
      }
      const fuente = await this.wompiClient.crearFuentePago({
        llavePrivada,
        token,
        customerEmail: 'facturacion@somosaura.dev',
        acceptanceToken,
        acceptPersonalAuth,
      });
      paymentSourceIdCreado = fuente.paymentSourceId;

      const resultado = await this.wompiClient.crearTransaccionConFuente({
        llavePrivada,
        amountInCents: montoEnCentavos,
        currency,
        reference: referencia,
        signature,
        paymentSourceId: fuente.paymentSourceId,
        customerEmail: 'facturacion@somosaura.dev',
      });
      wompiTransactionId = resultado.wompiTransactionId;
      status = resultado.status;
    } else {
      const wompiType = WOMPI_PAYMENT_TYPE[dto.metodo];
      const requierePaymentDescription = wompiType === 'BANCOLOMBIA_QR' || wompiType === 'PSE';
      const paymentMethod = {
        ...(requierePaymentDescription ? { payment_description: `Suscripción AURA — ${paquete.nombre}` } : {}),
        ...dto.datosMetodo,
        type: wompiType,
      };

      const resultado = await this.wompiClient.crearTransaccion({
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
      wompiTransactionId = resultado.wompiTransactionId;
      status = resultado.status;

      // Wompi no manda `qr_image` en la respuesta de POST /transactions para
      // BANCOLOMBIA_QR — se genera async y solo aparece consultando
      // GET /transactions/{id} un rato después. Mismo bug y mismo fix que
      // PagosService.iniciarPago/esperarQrImagen (ver ese archivo): sin este
      // polling, el frontend siempre recibía `extra` vacío y no podía mostrar
      // ningún QR para pagar.
      extra =
        wompiType === 'BANCOLOMBIA_QR' && !resultado.extra?.['qr_image']
          ? await this.esperarQrImagen(wompiTransactionId, llavePublica)
          : resultado.extra;
    }

    await this.transaccionesRepository.save(
      this.transaccionesRepository.create({
        negocioId,
        paqueteId,
        referencia,
        wompiTransactionId,
        metodoPago: dto.metodo,
        estado: status === 'APPROVED' ? 'APROBADA' : 'PENDIENTE',
        montoEnCentavos,
        origen: 'MANUAL',
      }),
    );

    if (status === 'APPROVED') {
      await this.activarTrasPago(negocioId, paqueteId);
      if (paymentSourceIdCreado) {
        await this.guardarMedioPago(negocioId, paymentSourceIdCreado, dto.ultimosCuatroDigitos!);
      }
    }

    return { referencia, wompiTransactionId, extra };
  }

  private async guardarMedioPago(negocioId: string, paymentSourceId: number, ultimosCuatroDigitos: string): Promise<void> {
    const existente = await this.medioPagoRepository.findOne({ where: { negocioId } });
    if (existente) {
      existente.wompiPaymentSourceId = paymentSourceId;
      existente.ultimosCuatroDigitos = ultimosCuatroDigitos;
      existente.activo = true;
      await this.medioPagoRepository.save(existente);
      return;
    }
    await this.medioPagoRepository.save(
      this.medioPagoRepository.create({ negocioId, wompiPaymentSourceId: paymentSourceId, ultimosCuatroDigitos, activo: true }),
    );
  }

  async obtenerMedioPago(negocioId: string): Promise<MedioPagoGuardado | null> {
    return this.medioPagoRepository.findOne({ where: { negocioId, activo: true } });
  }

  async quitarMedioPago(negocioId: string): Promise<void> {
    const medioPago = await this.medioPagoRepository.findOne({ where: { negocioId } });
    if (!medioPago) return;
    medioPago.activo = false;
    await this.medioPagoRepository.save(medioPago);
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
    if (!secreto) {
      // No-op silencioso hacia Wompi (fail-closed correcto), pero acá adentro sí queda rastro:
      // sin esto, una config faltante en producción tumba TODA la confirmación de pagos de
      // suscripción sin que nadie se entere hasta que un cliente reclame que pagó y sigue
      // bloqueado — reconciliarPendientes lo tapa parcialmente (corre cada minuto), pero solo
      // durante la primera hora de vida de cada transacción.
      this.logger.error('WOMPI_PLATAFORMA_LLAVE_SECRETA_EVENTOS no configurada — webhook de suscripción descartado');
      return;
    }
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
      // Confirmado en vivo contra el sandbox real: un cobro con tarjeta vía payment_source NO
      // resuelve APPROVED/DECLINED de forma síncrona — `crearTransaccionConFuente` devuelve
      // PENDING y esto (el webhook) es lo que confirma el resultado real más adelante. Si el
      // origen es AUTOMATICO, este es el único lugar (junto con `reconciliarPendientes`, mismo
      // fix abajo) donde un DECLINED real cuenta como intento fallido — `cobrarAutomatico` ya NO
      // lo cuenta cuando el estado inicial es PENDING, para no penalizar un cobro que en realidad
      // puede terminar aprobado segundos después.
      if (transaccion.origen === 'AUTOMATICO') {
        await this.registrarIntentoFallido(transaccion.negocioId);
      }
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
        // Mismo motivo que en procesarWebhookWompi: si el webhook nunca llegó y este polling es
        // el que confirma el DECLINED, sigue siendo el momento real de contar el intento fallido
        // para el cron de cobro automático.
        if (actual.origen === 'AUTOMATICO') {
          await this.registrarIntentoFallido(actual.negocioId);
        }
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
    // Único punto de éxito compartido por reactivación manual, webhook, polling de respaldo y
    // cobro automático — sin este reset, un negocio que falla una vez y luego cobra bien seguiría
    // acumulando el contador en el próximo fallo aislado, marcando VENCIDA mucho antes de las 3
    // fallas CONSECUTIVAS que exige el spec.
    suscripcion.intentosFallidosCobro = 0;
    // Cada ciclo de facturación empieza limpio — sin esto, un negocio que renovó recién no
    // volvería a recibir el recordatorio de "día -2" del próximo ciclo porque la etiqueta de
    // este ciclo ya estaría marcada.
    suscripcion.recordatoriosEnviados = [];
    await this.suscripcionesRepository.save(suscripcion);

    this.realtimeGateway.emitToNegocio(negocioId, 'suscripcion:cambio', { estado: EstadoSuscripcion.ACTIVA });
  }

  /** Válido en ACTIVA o PRUEBA. Nunca toca fechaFin — ya pagó ese período (o sigue en el trial gratis), no se corta antes de tiempo. */
  async cancelar(negocioId: string, motivo?: string): Promise<Suscripcion> {
    const suscripcion = await this.suscripcionesRepository.findOne({ where: { negocioId } });
    if (!suscripcion || (suscripcion.estado !== EstadoSuscripcion.ACTIVA && suscripcion.estado !== EstadoSuscripcion.PRUEBA)) {
      throw new BadRequestException('Solo se puede cancelar una suscripción activa o en prueba');
    }
    suscripcion.estado = EstadoSuscripcion.CANCELADA;
    suscripcion.motivoCancelacion = motivo ?? null;
    const guardada = await this.suscripcionesRepository.save(suscripcion);
    this.realtimeGateway.emitToNegocio(negocioId, 'suscripcion:cambio', { estado: EstadoSuscripcion.CANCELADA });
    return guardada;
  }

  /** Revierte una cancelación mientras el período ya pagado sigue vigente — gratis, no cobra nada de nuevo. */
  async revertirCancelacion(negocioId: string): Promise<Suscripcion> {
    const suscripcion = await this.suscripcionesRepository.findOne({ where: { negocioId } });
    const ahora = new Date();
    if (!suscripcion || suscripcion.estado !== EstadoSuscripcion.CANCELADA || !suscripcion.fechaFin || suscripcion.fechaFin <= ahora) {
      throw new BadRequestException('Solo se puede reactivar una cancelación cuyo período pagado no venció todavía');
    }
    suscripcion.estado = EstadoSuscripcion.ACTIVA;
    const guardada = await this.suscripcionesRepository.save(suscripcion);
    this.realtimeGateway.emitToNegocio(negocioId, 'suscripcion:cambio', { estado: EstadoSuscripcion.ACTIVA });
    return guardada;
  }

  /** Solo durante PRUEBA — sigue siendo gratis, no toca fechaFin ni dispara ningún cobro. */
  async cambiarPaqueteEnPrueba(negocioId: string, nuevoPaqueteId: string): Promise<Suscripcion> {
    const suscripcion = await this.suscripcionesRepository.findOne({ where: { negocioId } });
    if (!suscripcion || suscripcion.estado !== EstadoSuscripcion.PRUEBA) {
      throw new BadRequestException('Solo se puede cambiar de plan sin pagar mientras dure la prueba gratis');
    }
    await this.paquetesService.findOne(nuevoPaqueteId); // valida que exista
    suscripcion.paqueteId = nuevoPaqueteId;
    return this.suscripcionesRepository.save(suscripcion);
  }

  /** Corrida periódica (ver SuscripcionesCronService): PRUEBA/ACTIVA vencidas pasan a VENCIDA — excluye negocios con medio de pago guardado activo, esos los maneja `cobrarAutomatico()`. */
  async marcarVencidas(): Promise<void> {
    const ahora = new Date();
    const negociosConMedioPago = await this.medioPagoRepository.find({ where: { activo: true } });
    const idsExcluidos = negociosConMedioPago.map((m) => m.negocioId);

    const query = this.suscripcionesRepository
      .createQueryBuilder()
      .update(Suscripcion)
      .set({ estado: EstadoSuscripcion.VENCIDA })
      .where('estado IN (:...estados)', { estados: [EstadoSuscripcion.PRUEBA, EstadoSuscripcion.ACTIVA] })
      .andWhere('fecha_fin IS NOT NULL AND fecha_fin < :ahora', { ahora });

    if (idsExcluidos.length > 0) {
      query.andWhere('negocio_id NOT IN (:...idsExcluidos)', { idsExcluidos });
    }

    await query.execute();
  }

  /** Corrida diaria: cobra a todo negocio ACTIVA/PRUEBA vencido con medio de pago guardado. Un intento por negocio por corrida. */
  async cobrarAutomatico(): Promise<void> {
    const ahora = new Date();
    const vencidas = await this.suscripcionesRepository.find({
      where: [{ estado: EstadoSuscripcion.ACTIVA }, { estado: EstadoSuscripcion.PRUEBA }],
    });

    for (const suscripcion of vencidas) {
      if (!suscripcion.fechaFin || suscripcion.fechaFin > ahora) continue;

      // Todo el cuerpo por negocio, incluidas las dos consultas de guarda de abajo, vive DENTRO
      // del try — un error de DB puntual en cualquiera de ellas (no solo en la llamada a Wompi)
      // tiene que contar igual como intento fallido de este negocio, no escaparse del for y dejar
      // sin procesar a los que vienen después esa noche (mismo bug que el catch de más abajo ya
      // documenta, pero que originalmente solo cubría la mitad del cuerpo).
      try {
        const medioPago = await this.medioPagoRepository.findOne({
          where: { negocioId: suscripcion.negocioId, activo: true },
        });
        if (!medioPago) continue; // sin tarjeta guardada — lo maneja marcarVencidas()

        // Guarda contra doble cobro si el cron corre dos veces el mismo día (ej. el proceso murió
        // justo después de que Wompi aprobó el cobro pero antes de que este método terminara de
        // actualizar la Suscripcion, y algo lo reintenta) — mismo criterio de ventana de tiempo que
        // la idempotencia de `iniciarReactivacion`, pero con una ventana de ~1 día porque este cron
        // corre una vez por día, no por click de usuario.
        const yaIntentadoHoy = await this.transaccionesRepository
          .createQueryBuilder('t')
          .where('t.negocio_id = :negocioId', { negocioId: suscripcion.negocioId })
          .andWhere('t.origen = :origen', { origen: 'AUTOMATICO' })
          .andWhere("t.created_at > now() - interval '20 hours'")
          .getOne();
        if (yaIntentadoHoy) continue;

        const paquete = await this.paquetesService.findOne(suscripcion.paqueteId);
        const llavePrivada = process.env.WOMPI_PLATAFORMA_LLAVE_PRIVADA!;
        const llaveIntegridad = process.env.WOMPI_PLATAFORMA_LLAVE_INTEGRIDAD!;
        const montoEnCentavos = Math.round(Number(paquete.precioMensual) * 100);
        const referencia = randomUUID();
        const currency = 'COP';
        const signature = createHash('sha256')
          .update(`${referencia}${montoEnCentavos}${currency}${llaveIntegridad}`)
          .digest('hex');

        const { wompiTransactionId, status } = await this.wompiClient.crearTransaccionConFuente({
          llavePrivada,
          amountInCents: montoEnCentavos,
          currency,
          reference: referencia,
          signature,
          paymentSourceId: medioPago.wompiPaymentSourceId,
          customerEmail: 'facturacion@somosaura.dev',
          recurrente: true,
        });

        await this.transaccionesRepository.save(
          this.transaccionesRepository.create({
            negocioId: suscripcion.negocioId,
            paqueteId: suscripcion.paqueteId,
            referencia,
            wompiTransactionId,
            metodoPago: 'TARJETA',
            estado: status === 'APPROVED' ? 'APROBADA' : status === 'DECLINED' ? 'DECLINADA' : 'PENDIENTE',
            montoEnCentavos,
            origen: 'AUTOMATICO',
          }),
        );

        // Confirmado en vivo contra el sandbox real de Wompi: un cobro con `payment_source_id`
        // NO resuelve APPROVED/DECLINED de forma síncrona — la respuesta normal es PENDING, y el
        // resultado real llega después por webhook (`procesarWebhookWompi`) o por el polling de
        // respaldo (`reconciliarPendientes`), que ahora son los que cuentan el intento fallido si
        // termina en DECLINED (ver esos métodos). Contarlo acá también para un PENDING penalizaría
        // un cobro que en la práctica puede terminar aprobado segundos después — solo un DECLINED
        // *inmediato y real* (poco común, pero posible) cuenta como fallo en este mismo momento.
        if (status === 'APPROVED') {
          await this.activarTrasPago(suscripcion.negocioId, suscripcion.paqueteId);
        } else if (status === 'DECLINED') {
          await this.registrarIntentoFallido(suscripcion.negocioId);
        }
      } catch (error) {
        // Un error acá (Wompi caído, paquete borrado, timeout de red) NO puede tumbar el resto de
        // la corrida — sin este catch, una sola excepción cortaba el for y dejaba SIN PROCESAR a
        // todos los negocios que venían después en el array esa noche. Tampoco puede dejar a este
        // negocio sin contar como intento: sin esto, `intentosFallidosCobro` nunca avanza para un
        // negocio cuyo error ocurre siempre antes de la línea que lo incrementa, y ese negocio
        // queda en limbo para siempre (ni se cobra ni llega nunca a los 3 fallos que lo marcarían
        // VENCIDA — `marcarVencidas()` además lo excluye por tener medio de pago activo).
        this.logger.error(
          `Error cobrando automáticamente al negocio ${suscripcion.negocioId}`,
          error instanceof Error ? error.stack : String(error),
        );
        await this.registrarIntentoFallido(suscripcion.negocioId);
      }
    }
  }

  /**
   * Único punto donde se cuenta un fallo real de `cobrarAutomatico()` — llamado tanto por el
   * DECLINED síncrono (raro) como por el webhook y `reconciliarPendientes()` cuando confirman
   * DECLINED de forma asíncrona (el caso real y común, confirmado en vivo contra el sandbox de
   * Wompi: un cobro con `payment_source_id` casi siempre responde PENDING primero). El aviso de
   * "cobro fallido" vive acá, no repartido en cada call site, para no perderlo en el camino
   * asíncrono que en la práctica es el que más ocurre.
   */
  private async registrarIntentoFallido(negocioId: string): Promise<void> {
    const actual = await this.suscripcionesRepository.findOne({ where: { negocioId } });
    if (!actual) return;
    actual.intentosFallidosCobro += 1;
    if (actual.intentosFallidosCobro >= 3) {
      actual.estado = EstadoSuscripcion.VENCIDA;
    }
    await this.suscripcionesRepository.save(actual);

    // El aviso (correo + alerta) es best-effort — el conteo del fallo de arriba, que es lo que
    // hace de verdad que la suscripción avance hacia VENCIDA, ya quedó guardado. Sin este
    // try/catch, un paquete borrado (`paquetesService.findOne` lanza `NotFoundException`) o
    // cualquier otro error de esta parte se escaparía de acá hacia el `catch` de
    // `cobrarAutomatico()` que llama a este método — reintroduciendo exactamente el bug de
    // "limbo permanente" que ese `catch` existe para evitar (corta el resto de la corrida esa
    // noche). Confirmado real en revisión: `registrarIntentoFallido` no tenía su propio try/catch.
    try {
      const negocio = await this.negociosRepository.findOne({ where: { id: negocioId } });
      const admin = await this.usuariosRepository.findOne({
        where: { negocioId, activo: true },
        order: { createdAt: 'ASC' },
      });
      if (!negocio || !admin) return;

      const paquete = await this.paquetesService.findOne(actual.paqueteId);
      const { subject, html } = construirCorreoCobroFallido(
        paquete.nombre,
        actual.intentosFallidosCobro,
        `${process.env.FRONTEND_URL}/suscripcion-vencida`,
      );
      await this.emailService.enviar({ to: admin.email, subject, html });
      await this.crearOActualizarAlerta(
        negocioId,
        actual.id,
        TipoAlerta.SUSCRIPCION_COBRO_FALLIDO,
        actual.intentosFallidosCobro >= 3 ? SeveridadAlerta.CRITICA : SeveridadAlerta.ALTA,
        subject,
      );
    } catch (error) {
      this.logger.error(
        `Error avisando el fallo de cobro al negocio ${negocioId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Corrida diaria a la 1am (antes del cobro automático de las 2am): correo + alerta in-app en día -2/-1/0, sin duplicar por ciclo. */
  async enviarRecordatorios(): Promise<void> {
    const candidatas = await this.suscripcionesRepository.find({
      where: [{ estado: EstadoSuscripcion.PRUEBA }, { estado: EstadoSuscripcion.ACTIVA }],
    });

    for (const suscripcion of candidatas) {
      if (!suscripcion.fechaFin) continue;

      const diasRestantes = Math.round(
        (suscripcion.fechaFin.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      );
      if (![2, 1, 0].includes(diasRestantes)) continue;

      const etiqueta = `DIA_-${diasRestantes}`.replace('DIA_-0', 'DIA_0');
      if (suscripcion.recordatoriosEnviados.includes(etiqueta)) continue;

      // Un error puntual en un negocio (paquete borrado, correo mal configurado) no puede cortar
      // el resto de la corrida — mismo bug de "limbo permanente" ya encontrado y corregido en
      // `cobrarAutomatico()`: sin este try/catch, una excepción acá dejaría sin recordatorio a
      // todos los negocios que vinieran después en el array esa noche.
      try {
        const negocio = await this.negociosRepository.findOne({ where: { id: suscripcion.negocioId } });
        const admin = await this.usuariosRepository.findOne({
          where: { negocioId: suscripcion.negocioId, activo: true },
          order: { createdAt: 'ASC' },
        });
        if (!negocio || !admin) continue;

        const paquete = await this.paquetesService.findOne(suscripcion.paqueteId);
        const medioPago = await this.medioPagoRepository.findOne({
          where: { negocioId: suscripcion.negocioId, activo: true },
        });

        const { subject, html } =
          diasRestantes === 0
            ? construirCorreoRecordatorioDia0(
                paquete.nombre,
                !!medioPago,
                `${process.env.FRONTEND_URL}/suscripcion-vencida`,
                medioPago?.ultimosCuatroDigitos,
              )
            : construirCorreoRecordatorioProximo(paquete.nombre, diasRestantes, !!medioPago, medioPago?.ultimosCuatroDigitos);

        await this.emailService.enviar({ to: admin.email, subject, html });

        await this.crearOActualizarAlerta(
          suscripcion.negocioId,
          suscripcion.id,
          TipoAlerta.SUSCRIPCION_PROXIMO_COBRO,
          diasRestantes === 0 ? SeveridadAlerta.ALTA : SeveridadAlerta.MEDIA,
          subject,
        );

        suscripcion.recordatoriosEnviados = [...suscripcion.recordatoriosEnviados, etiqueta];
        await this.suscripcionesRepository.save(suscripcion);
      } catch (error) {
        this.logger.error(
          `Error enviando recordatorio de pago al negocio ${suscripcion.negocioId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /**
   * Réplica minimalista de AlertasService.upsert (mismo criterio de idempotencia: no duplica una
   * alerta activa no resuelta del mismo tipo+referencia) — no se reusa AlertasService directamente
   * para no introducir un ciclo de dependencia de módulos
   * (SuscripcionesModule → AlertasModule → NegociosModule → SuscripcionesModule, esta última
   * arista ya la creó la pieza 2 al inyectar SuscripcionesService en NegociosService).
   */
  private async crearOActualizarAlerta(
    negocioId: string,
    referenciaId: string,
    tipo: TipoAlerta,
    severidad: SeveridadAlerta,
    mensaje: string,
  ): Promise<void> {
    const existente = await this.alertasRepository.findOne({
      where: { negocioId, tipo, referenciaId, resuelta: false },
    });
    if (existente) {
      existente.severidad = severidad;
      existente.mensaje = mensaje;
      const actualizada = await this.alertasRepository.save(existente);
      this.realtimeGateway.emitToNegocio(negocioId, 'alertas:cambio', actualizada);
      return;
    }
    const creada = await this.alertasRepository.save(
      this.alertasRepository.create({ negocioId, tipo, referenciaId, severidad, mensaje }),
    );
    this.realtimeGateway.emitToNegocio(negocioId, 'alertas:cambio', creada);
  }

  private mesActual(): string {
    const ahora = new Date();
    return `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private async obtenerSuscripcionConPaquete(negocioId: string): Promise<Suscripcion & { paquete: Paquete }> {
    const suscripcion = await this.suscripcionesRepository.findOneOrFail({
      where: { negocioId },
      relations: { paquete: true },
    });
    const paquete = suscripcion.paquete ?? (await this.paquetesService.findOne(suscripcion.paqueteId));
    return Object.assign(suscripcion, { paquete });
  }

  /** Gating genérico por feature del paquete contratado (ej. 'facturacionDianHabilitada', 'tiendaOnlineHabilitada'). */
  async tieneFeature(negocioId: string, feature: keyof Paquete): Promise<boolean> {
    const { paquete } = await this.obtenerSuscripcionConPaquete(negocioId);
    return Boolean(paquete[feature]);
  }

  /**
   * Cupo del paquete (ej. `Paquete.documentosDianPorMes`) vs. consumo ya registrado este mes
   * (`Suscripcion.consumoMensual`, reseteado automáticamente al cambiar de mes).
   */
  async obtenerCupoYConsumo(negocioId: string, feature: keyof Paquete): Promise<{ cupo: number; consumo: number }> {
    const { paquete, consumoMensual, consumoMesReferencia } = await this.obtenerSuscripcionConPaquete(negocioId);
    const cupo = Number(paquete[feature] ?? 0);
    const consumo = consumoMesReferencia === this.mesActual() ? (consumoMensual[feature as string] ?? 0) : 0;
    return { cupo, consumo };
  }

  /** Incrementa en 1 el consumo del mes actual para `feature` — resetea el contador si cambió el mes. */
  async registrarConsumo(negocioId: string, feature: string): Promise<void> {
    const suscripcion = await this.suscripcionesRepository.findOneOrFail({ where: { negocioId } });
    const mesActual = this.mesActual();
    if (suscripcion.consumoMesReferencia !== mesActual) {
      suscripcion.consumoMensual = {};
      suscripcion.consumoMesReferencia = mesActual;
    }
    suscripcion.consumoMensual[feature] = (suscripcion.consumoMensual[feature] ?? 0) + 1;
    await this.suscripcionesRepository.save(suscripcion);
  }
}
