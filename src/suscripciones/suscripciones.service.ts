import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { Suscripcion } from './entities/suscripcion.entity';
import { EstadoSuscripcion } from './entities/estado-suscripcion.enum';
import { TransaccionSuscripcion, MetodoPagoSuscripcion } from './entities/transaccion-suscripcion.entity';
import { MedioPagoGuardado } from './entities/medio-pago-guardado.entity';
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
  private readonly logger = new Logger(SuscripcionesService.name);

  constructor(
    @InjectRepository(Suscripcion)
    private readonly suscripcionesRepository: Repository<Suscripcion>,
    @InjectRepository(TransaccionSuscripcion)
    private readonly transaccionesRepository: Repository<TransaccionSuscripcion>,
    @InjectRepository(MedioPagoGuardado)
    private readonly medioPagoRepository: Repository<MedioPagoGuardado>,
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
    // Único punto de éxito compartido por reactivación manual, webhook, polling de respaldo y
    // cobro automático — sin este reset, un negocio que falla una vez y luego cobra bien seguiría
    // acumulando el contador en el próximo fallo aislado, marcando VENCIDA mucho antes de las 3
    // fallas CONSECUTIVAS que exige el spec.
    suscripcion.intentosFallidosCobro = 0;
    await this.suscripcionesRepository.save(suscripcion);

    this.realtimeGateway.emitToNegocio(negocioId, 'suscripcion:cambio', { estado: EstadoSuscripcion.ACTIVA });
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

      try {
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
            estado: status === 'APPROVED' ? 'APROBADA' : 'PENDIENTE',
            montoEnCentavos,
            origen: 'AUTOMATICO',
          }),
        );

        if (status === 'APPROVED') {
          await this.activarTrasPago(suscripcion.negocioId, suscripcion.paqueteId);
        } else {
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

  private async registrarIntentoFallido(negocioId: string): Promise<void> {
    const actual = await this.suscripcionesRepository.findOne({ where: { negocioId } });
    if (!actual) return;
    actual.intentosFallidosCobro += 1;
    if (actual.intentosFallidosCobro >= 3) {
      actual.estado = EstadoSuscripcion.VENCIDA;
    }
    await this.suscripcionesRepository.save(actual);
  }
}
