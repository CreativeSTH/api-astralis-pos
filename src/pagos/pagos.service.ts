import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { ConfiguracionPagoWompi } from './entities/configuracion-pago-wompi.entity';
import {
  MetodoPagoWompi,
  TransaccionPago,
} from './entities/transaccion-pago.entity';
import { WompiClientService } from './wompi-client.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MetodosPagoService } from '../metodos-pago/metodos-pago.service';
import { encriptar, desencriptar } from '../common/utils/cifrado';

/**
 * `VentasService.validarMetodosPago` exige que `VentaPago.metodoPago` calce
 * exacto con un método activo del catálogo del negocio (ver CLAUDE.md de este
 * repo) — el POS registra un pago Wompi con este string literal (ver
 * `punto-venta.ts`, `Wompi - ${metodo}`), así que tiene que existir en el
 * catálogo antes de que el cajero pueda cobrar con QR/Nequi.
 */
const METODOS_PAGO_WOMPI = ['Wompi - QR', 'Wompi - NEQUI'];

/**
 * Traducción de nuestro `MetodoPagoWompi` interno al `payment_method.type`
 * real que espera la API de Wompi — NO son el mismo string para todos:
 * Wompi no tiene un tipo `'QR'` (es `'BANCOLOMBIA_QR'`) ni `'TARJETA'` (es
 * `'CARD'`). El enum interno sigue llamándose como siempre en el resto de
 * la app; esta traducción ocurre únicamente acá, al armar el payload hacia
 * Wompi (ver docs.wompi.co).
 */
const WOMPI_PAYMENT_TYPE: Record<MetodoPagoWompi, string> = {
  QR: 'BANCOLOMBIA_QR',
  NEQUI: 'NEQUI',
  PSE: 'PSE',
  TARJETA: 'CARD',
};

/** Payload del webhook de eventos de Wompi (ver docs.wompi.co — sección "Eventos"). */
export interface WompiWebhookPayload {
  event: string;
  data: Record<string, Record<string, unknown>>;
  signature: { properties: string[]; checksum: string };
  timestamp: number;
}

@Injectable()
export class PagosService extends TenantBaseService<ConfiguracionPagoWompi> {
  constructor(
    @InjectRepository(ConfiguracionPagoWompi)
    private readonly configRepo: Repository<ConfiguracionPagoWompi>,
    @InjectRepository(TransaccionPago)
    private readonly transaccionRepo: Repository<TransaccionPago>,
    private readonly wompiClient: WompiClientService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly metodosPagoService: MetodosPagoService,
    cls: ClsService,
  ) {
    super(configRepo, cls, 'Configuración de pago Wompi');
  }

  private async obtenerOCrear(): Promise<ConfiguracionPagoWompi> {
    const negocioId = this.getNegocioId();
    let config = await this.configRepo.findOne({ where: { negocioId } });
    if (!config) {
      config = this.configRepo.create({ negocioId, activo: false });
    }
    return config;
  }

  async guardarConfiguracion(dto: {
    llavePublica: string;
    llavePrivada: string;
    llaveSecretaEventos: string;
    llaveIntegridad: string;
    qrHabilitado?: boolean;
    nequiHabilitado?: boolean;
    pseHabilitado?: boolean;
    tarjetaHabilitado?: boolean;
  }): Promise<void> {
    const config = await this.obtenerOCrear();
    config.llavePublica = dto.llavePublica;
    config.llavePrivadaCifrada = encriptar(dto.llavePrivada);
    config.llaveSecretaEventosCifrada = encriptar(dto.llaveSecretaEventos);
    config.llaveIntegridadCifrada = encriptar(dto.llaveIntegridad);
    // Los 4 booleanos son parciales/opcionales (a diferencia de las 3
    // credenciales de arriba, siempre obligatorias): si el caller no los
    // manda, no se pisa el valor existente en `config` con `undefined`.
    if (dto.qrHabilitado !== undefined) config.qrHabilitado = dto.qrHabilitado;
    if (dto.nequiHabilitado !== undefined)
      config.nequiHabilitado = dto.nequiHabilitado;
    if (dto.pseHabilitado !== undefined)
      config.pseHabilitado = dto.pseHabilitado;
    if (dto.tarjetaHabilitado !== undefined)
      config.tarjetaHabilitado = dto.tarjetaHabilitado;
    await this.configRepo.save(config);
  }

  async activar(): Promise<void> {
    const config = await this.configRepo.findOne({
      where: { negocioId: this.getNegocioId() },
    });
    const completo = !!(
      config?.llavePublica &&
      config?.llavePrivadaCifrada &&
      config?.llaveSecretaEventosCifrada &&
      config?.llaveIntegridadCifrada
    );
    if (!completo) {
      throw new BadRequestException(
        'Configurá las 4 credenciales de Wompi antes de activarlo',
      );
    }
    // ANTES de marcar `activo`, no después — si esto falla, Wompi no debe
    // quedar activo con el catálogo a medio crear (el cajero vería los
    // botones QR/Nequi, Wompi le cobraría al cliente, y `VentasService`
    // rechazaría la venta al no reconocer el método — fail-closed).
    for (const nombre of METODOS_PAGO_WOMPI) {
      await this.metodosPagoService.asegurarMetodo(nombre);
    }
    config.activo = true;
    await this.configRepo.save(config);
  }

  async desactivar(): Promise<void> {
    const config = await this.configRepo.findOne({
      where: { negocioId: this.getNegocioId() },
    });
    if (!config) {
      throw new NotFoundException(
        'Wompi no está configurado para este negocio',
      );
    }
    config.activo = false;
    await this.configRepo.save(config);
  }

  async obtenerConfiguracionPublica(): Promise<{
    llavePublica: string | null;
    activo: boolean;
    configurado: boolean;
    qrHabilitado: boolean;
    nequiHabilitado: boolean;
    pseHabilitado: boolean;
    tarjetaHabilitado: boolean;
  }> {
    const config = await this.configRepo.findOne({
      where: { negocioId: this.getNegocioId() },
    });
    return {
      llavePublica: config?.llavePublica ?? null,
      activo: config?.activo ?? false,
      configurado: !!(
        config?.llavePublica &&
        config?.llavePrivadaCifrada &&
        config?.llaveSecretaEventosCifrada &&
        config?.llaveIntegridadCifrada
      ),
      // `?? true` como fallback cuando no hay config todavía (negocio que
      // nunca configuró Wompi): el valor real no importa en ese caso porque
      // `activo` ya es `false`, pero mejor un default explícito que `undefined`.
      qrHabilitado: config?.qrHabilitado ?? true,
      nequiHabilitado: config?.nequiHabilitado ?? true,
      pseHabilitado: config?.pseHabilitado ?? true,
      tarjetaHabilitado: config?.tarjetaHabilitado ?? true,
    };
  }

  async iniciarPago(dto: {
    montoEnCentavos: number;
    metodo: MetodoPagoWompi;
    datosMetodo: Record<string, unknown>;
  }): Promise<{
    referencia: string;
    wompiTransactionId: string;
    extra?: Record<string, unknown>;
  }> {
    const negocioId = this.getNegocioId();
    const config = await this.configRepo.findOne({ where: { negocioId } });
    if (!config?.activo) {
      throw new BadRequestException('Wompi no está activo para este negocio');
    }

    const llavePrivada = desencriptar(config.llavePrivadaCifrada);
    const llaveIntegridad = desencriptar(config.llaveIntegridadCifrada);
    const { acceptanceToken, acceptPersonalAuth } =
      await this.wompiClient.obtenerTokensAceptacion(config.llavePublica);

    const wompiType = WOMPI_PAYMENT_TYPE[dto.metodo];
    // BANCOLOMBIA_QR y PSE exigen `payment_description` (Wompi rechaza la
    // transacción sin él); los otros métodos no lo usan. Es un valor fijo,
    // no se le pide al cajero.
    const requierePaymentDescription =
      wompiType === 'BANCOLOMBIA_QR' || wompiType === 'PSE';
    // Orden del spread, a propósito:
    // 1. `payment_description` por defecto va PRIMERO — si `datosMetodo` trae
    //    uno propio (no debería pasar, pero por las dudas), lo pisa a él, no
    //    al revés.
    // 2. `type` va AL FINAL, después de `...dto.datosMetodo` — así queda
    //    blindado: si `datosMetodo` trajera una clave `type` (por error, o
    //    un frontend con un bug/malicioso), nunca puede pisar el tipo real
    //    que este método acaba de decidir y que determina a quién le cobra
    //    Wompi.
    const paymentMethod = {
      ...(requierePaymentDescription
        ? { payment_description: 'Venta POS' }
        : {}),
      ...dto.datosMetodo,
      type: wompiType,
    };

    const referencia = randomUUID();
    const currency = 'COP';
    // Wompi exige esta firma en TODO `POST /transactions` (los 4 métodos, no
    // solo tarjeta) — sin ella, la API la rechaza con "Firma de integridad
    // requerida no enviada" (confirmado contra el error real). Orden fijo de
    // concatenación documentado por Wompi: referencia + monto + moneda +
    // llave de integridad, SHA256 en hex. Ver docs.wompi.co "Genera una
    // firma de integridad".
    const signature = createHash('sha256')
      .update(
        `${referencia}${dto.montoEnCentavos}${currency}${llaveIntegridad}`,
      )
      .digest('hex');

    const {
      wompiTransactionId,
      status,
      extra: extraInicial,
    } = await this.wompiClient.crearTransaccion({
      llavePrivada,
      amountInCents: dto.montoEnCentavos,
      currency,
      reference: referencia,
      signature,
      acceptanceToken,
      acceptPersonalAuth,
      paymentMethod,
      // Placeholder aceptable para venta de mostrador sin cliente identificado.
      // TODO: usar el email real del cliente cuando el POS lo resuelva.
      customerEmail: 'ventas@negocio.local',
    });

    // Wompi documenta que, para BANCOLOMBIA_QR, `qr_image` NO viene en la
    // respuesta de `POST /transactions` — se genera async del lado de Wompi
    // y solo aparece consultando `GET /transactions/{id}` un rato después.
    // Sin este polling, el frontend siempre recibía `extra` vacío para QR
    // (mismo bug que "Wompi no devolvió el código QR" reportado en vivo).
    const extra =
      wompiType === 'BANCOLOMBIA_QR' && !extraInicial?.['qr_image']
        ? await this.esperarQrImagen(wompiTransactionId, config.llavePublica)
        : extraInicial;

    await this.transaccionRepo.save(
      this.transaccionRepo.create({
        negocioId,
        referencia,
        wompiTransactionId,
        metodoPago: dto.metodo,
        estado: status === 'APPROVED' ? 'APROBADA' : 'PENDIENTE',
        montoEnCentavos: dto.montoEnCentavos,
      }),
    );

    return { referencia, wompiTransactionId, extra };
  }

  /**
   * Polling corto (no long-polling real) contra `GET /transactions/{id}` hasta que Wompi termine
   * de generar el QR o se agote el presupuesto de tiempo — el cajero ya está viendo un spinner
   * ("Iniciando pago con QR...") mientras tanto, así que unos segundos de espera bloqueante acá
   * son aceptables; más que eso empezaría a sentirse colgado. Si se agota sin encontrar
   * `qr_image`, devuelve lo último que haya (probablemente `undefined`) — el frontend ya maneja
   * ese caso mostrando un estado de error en vez de un `<img>` roto.
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
      const resultado = await this.wompiClient.obtenerTransaccion(
        wompiTransactionId,
        llavePublica,
      );
      extra = resultado.extra;
      if (extra?.['qr_image']) break;
    }
    return extra;
  }

  /**
   * Procesa un evento de webhook de Wompi. Es un endpoint público sin JWT
   * (Task 7 lo expone como @Public()) — la firma SHA256 es la ÚNICA defensa
   * contra un payload forjado, así que se verifica ANTES de tocar cualquier
   * dato y CUALQUIER fallo (firma inválida, payload malformado, transacción
   * desconocida, propiedades firmadas inesperadas, transaction.id que no
   * coincide con el de la transacción, transacción que ya no está PENDIENTE)
   * descarta el evento en silencio: sin lanzar excepción, sin tocar la DB,
   * sin darle a un posible atacante ninguna señal de por qué falló.
   *
   * negocioId NO viene de this.getNegocioId() (no hay contexto CLS en un
   * webhook sin JWT) — se resuelve de la TransaccionPago encontrada por
   * `referencia`, que es la excepción documentada al patrón TenantBaseService
   * para este único método.
   */
  async procesarWebhook(payload: WompiWebhookPayload): Promise<void> {
    if (payload?.event !== 'transaction.updated') return;

    const referencia = payload.data?.transaction?.reference as
      string | undefined;
    if (!referencia) return;

    const transaccion = await this.transaccionRepo.findOne({
      where: { referencia },
    });
    if (!transaccion) return; // evento de una transacción que no es nuestra o ya no existe

    // Guard de replay / orden: una transacción solo transiciona una vez desde
    // PENDIENTE. Si ya fue procesada (este mismo evento reenviado por Wompi,
    // o un evento fuera de orden llegando después de uno más reciente), no
    // hay nada que hacer — no-op silencioso, no un error.
    if (transaccion.estado !== 'PENDIENTE') return;

    const config = await this.configRepo.findOne({
      where: { negocioId: transaccion.negocioId },
    });
    if (!config?.llaveSecretaEventosCifrada) return;

    const secreto = desencriptar(config.llaveSecretaEventosCifrada);

    // Wompi documenta explícitamente que el set de propiedades firmadas
    // puede variar entre eventos y en el tiempo, así que NO se puede exigir
    // un calce exacto contra un array fijo (el payload real de
    // transaction.updated hoy firma tres: transaction.id, transaction.status
    // Y transaction.amount_in_cents). Lo que sí es fijo es qué campos usa
    // ESTE método: `transaction.id` (para el cross-check de abajo) y
    // `transaction.status` (para decidir el estado). Si cualquiera de los
    // dos no está en `properties`, el checksum no cubre un campo del que
    // este código depende, así que se descarta — pero el checksum en sí se
    // calcula sobre el array COMPLETO que mandó Wompi, no sobre un subset
    // hardcodeado.
    const properties = payload.signature?.properties;
    if (
      !Array.isArray(properties) ||
      !properties.includes('transaction.id') ||
      !properties.includes('transaction.status')
    ) {
      return;
    }

    // Concatena, EN ORDEN, los valores de esas propiedades + el timestamp +
    // el secreto del negocio, y compara el SHA256 contra el checksum
    // recibido. Acceso con optional chaining a propósito: un payload
    // malformado (entidad/campo inexistente) produce `undefined` en vez de
    // lanzar una excepción — el checksum resultante simplemente no calza,
    // así el evento se descarta por el mismo camino que una firma inválida,
    // sin distinguir el motivo hacia afuera.
    let checksumEsperado: string;
    try {
      const valores = properties.map((prop) => {
        const [entidad, campo] = prop.split('.');
        return payload.data?.[entidad]?.[campo];
      });
      const cadena = valores.join('') + payload.timestamp + secreto;
      checksumEsperado = createHash('sha256').update(cadena).digest('hex');
    } catch {
      return; // payload estructuralmente inválido — descartar en silencio, mismo tratamiento que una firma inválida
    }

    // Comparación case-insensitive (Wompi no documenta con qué casing manda
    // el hex, así que no se puede asumir uno) y a tiempo constante — evita
    // filtrar por timing cuánto de los primeros bytes coincide. `Buffer.from`
    // sobre hex con casing distinto produce igualmente el buffer correcto
    // (hex es case-insensitive per se), así que basta con normalizar a
    // minúsculas antes; `timingSafeEqual` lanza si los buffers no tienen el
    // mismo largo, así que ese caso se descarta ANTES de llamarlo, nunca se
    // deja escapar la excepción.
    const checksumRecibido = payload.signature?.checksum;
    if (typeof checksumRecibido !== 'string') return;
    const bufEsperado = Buffer.from(checksumEsperado.toLowerCase(), 'hex');
    const bufRecibido = Buffer.from(checksumRecibido.toLowerCase(), 'hex');
    if (
      bufEsperado.length !== bufRecibido.length ||
      !timingSafeEqual(bufEsperado, bufRecibido)
    ) {
      return; // firma inválida — descartar en silencio, no darle información a un posible atacante
    }

    // `reference` (usada arriba para ubicar la transacción) NUNCA forma parte
    // del set firmado por Wompi, así que una firma válida no prueba nada
    // sobre ella. Si ya conocemos el wompiTransactionId real de esta
    // transacción (siempre lo conocemos: Task 5 lo graba en iniciarPago),
    // exigimos que coincida con `transaction.id`, que SÍ está firmado. Esto
    // cierra el ataque de "swap de reference": un checksum válido capturado
    // para OTRA transacción PENDIENTE del mismo negocio no puede reusarse
    // apuntándolo, vía `reference`, a esta transacción.
    const transactionId = payload.data.transaction.id as string;
    if (
      transaccion.wompiTransactionId &&
      transactionId !== transaccion.wompiTransactionId
    ) {
      return;
    }

    // Solo APPROVED/DECLINED son estados TERMINALES de Wompi. Cualquier otro
    // (PENDING, VOIDED, etc.) es un estado intermedio — si lo mapeáramos a
    // ERROR y lo guardáramos, el guard de "una transacción solo transiciona
    // una vez desde PENDIENTE" (arriba) quedaría consumido, y un APPROVED
    // genuino que llegue después (el pago sí se confirmó del lado de Wompi)
    // se descartaría en silencio porque `transaccion.estado` ya no sería
    // PENDIENTE. Para un estado no terminal no se escribe nada: se deja la
    // transacción en PENDIENTE para que un evento posterior, más definitivo,
    // todavía pueda resolverla.
    const status = payload.data.transaction.status as string;
    if (status !== 'APPROVED' && status !== 'DECLINED') return;

    await this.resolverTransaccionTerminal(transaccion, status, transactionId);
  }

  /**
   * Escribe el resultado TERMINAL (APPROVED/DECLINED) de Wompi sobre una `TransaccionPago` y, si
   * quedó aprobada, avisa por realtime — compartido entre `procesarWebhook` (camino rápido, evento
   * push) y `reconciliarPendientes` (respaldo por polling, ver abajo) para que ambos caminos
   * actualicen el estado exactamente igual, sin dos copias de esta lógica divergiendo con el
   * tiempo.
   */
  private async resolverTransaccionTerminal(
    transaccion: TransaccionPago,
    status: 'APPROVED' | 'DECLINED',
    wompiTransactionId: string,
  ): Promise<void> {
    transaccion.estado = status === 'APPROVED' ? 'APROBADA' : 'DECLINADA';
    transaccion.wompiTransactionId = wompiTransactionId;
    transaccion.confirmedAt = new Date();
    await this.transaccionRepo.save(transaccion);

    // Antes solo se avisaba por realtime cuando el pago se APROBABA — un
    // DECLINADA se guardaba en silencio y el cajero quedaba esperando para
    // siempre en el POS sin ninguna señal de que el cliente canceló/rechazó
    // el pago (bug real reportado en vivo). Ahora se avisa en ambos casos,
    // con eventos distintos para que el frontend pueda reaccionar distinto
    // (cerrar el cobro vs. volver al modal normal).
    this.realtimeGateway.emitToNegocio(
      transaccion.negocioId,
      transaccion.estado === 'APROBADA'
        ? 'pago-wompi:confirmado'
        : 'pago-wompi:declinado',
      { referencia: transaccion.referencia },
    );
  }

  /**
   * Respaldo del webhook: el webhook exige que este backend sea alcanzable públicamente por
   * Wompi (URL de eventos configurada en su panel de comercios) — en desarrollo local, o si esa
   * URL nunca se configuró o el túnel/red falla, el webhook simplemente NUNCA llega y el cajero
   * queda esperando para siempre sin ninguna señal (bug real reportado en vivo). Este método,
   * llamado periódicamente por `PagosCronService`, consulta activamente contra Wompi el estado de
   * cualquier `TransaccionPago` que siga PENDIENTE, así el sistema no depende 100% de que el
   * webhook funcione — mismo patrón defensivo que cualquier integración de pagos seria (nunca
   * confiar solo en el webhook).
   *
   * Deliberadamente NO tenant-scoped (recorre todos los negocios) — es un job de mantenimiento
   * interno sin request/JWT, mismo tipo de excepción ya documentado para `procesarWebhook`.
   * Acotado a transacciones de la última hora: una más vieja que eso es, en la práctica, un pago
   * que el cliente abandonó (mismo criterio que ya documenta `cancelarPagoWompi` del frontend —
   * quedar en PENDIENTE para siempre ahí es aceptado a propósito), y sin este corte el query y el
   * volumen de llamadas a Wompi crecerían sin límite con el tiempo.
   */
  async reconciliarPendientes(): Promise<void> {
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
    const pendientes = await this.transaccionRepo.find({
      where: { estado: 'PENDIENTE' },
    });

    for (const transaccion of pendientes) {
      if (
        !transaccion.wompiTransactionId ||
        transaccion.createdAt < haceUnaHora
      ) {
        continue;
      }
      const config = await this.configRepo.findOne({
        where: { negocioId: transaccion.negocioId },
      });
      if (!config?.llavePublica) continue;

      const { status } = await this.wompiClient.obtenerTransaccion(
        transaccion.wompiTransactionId,
        config.llavePublica,
      );
      if (status !== 'APPROVED' && status !== 'DECLINED') continue;

      // Re-chequeo contra la DB (no contra la copia en memoria de `pendientes`,
      // ya vieja para este punto) — si el webhook ya la resolvió mientras
      // esta vuelta del polling estaba en curso, no pisarla de nuevo.
      const actual = await this.transaccionRepo.findOne({
        where: { id: transaccion.id },
      });
      if (!actual || actual.estado !== 'PENDIENTE') continue;

      await this.resolverTransaccionTerminal(
        actual,
        status,
        transaccion.wompiTransactionId,
      );
    }
  }
}
