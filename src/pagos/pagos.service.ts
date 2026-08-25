import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { createHash, randomUUID } from 'crypto';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { ConfiguracionPagoWompi } from './entities/configuracion-pago-wompi.entity';
import {
  MetodoPagoWompi,
  TransaccionPago,
} from './entities/transaccion-pago.entity';
import { WompiClientService } from './wompi-client.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { encriptar, desencriptar } from '../common/utils/cifrado';

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
  }): Promise<void> {
    const config = await this.obtenerOCrear();
    config.llavePublica = dto.llavePublica;
    config.llavePrivadaCifrada = encriptar(dto.llavePrivada);
    config.llaveSecretaEventosCifrada = encriptar(dto.llaveSecretaEventos);
    await this.configRepo.save(config);
  }

  async activar(): Promise<void> {
    const config = await this.configRepo.findOne({
      where: { negocioId: this.getNegocioId() },
    });
    const completo = !!(
      config?.llavePublica &&
      config?.llavePrivadaCifrada &&
      config?.llaveSecretaEventosCifrada
    );
    if (!completo) {
      throw new BadRequestException(
        'Configurá las 3 credenciales de Wompi antes de activarlo',
      );
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
        config?.llaveSecretaEventosCifrada
      ),
    };
  }

  async iniciarPago(dto: {
    montoEnCentavos: number;
    metodo: MetodoPagoWompi;
    datosMetodo: Record<string, unknown>;
  }): Promise<{ referencia: string; wompiTransactionId: string }> {
    const negocioId = this.getNegocioId();
    const config = await this.configRepo.findOne({ where: { negocioId } });
    if (!config?.activo) {
      throw new BadRequestException('Wompi no está activo para este negocio');
    }

    const llavePrivada = desencriptar(config.llavePrivadaCifrada);
    const { acceptanceToken, acceptPersonalAuth } =
      await this.wompiClient.obtenerTokensAceptacion(config.llavePublica);

    const referencia = randomUUID();
    const { wompiTransactionId, status } =
      await this.wompiClient.crearTransaccion({
        llavePrivada,
        amountInCents: dto.montoEnCentavos,
        reference: referencia,
        acceptanceToken,
        acceptPersonalAuth,
        paymentMethod: { type: dto.metodo, ...dto.datosMetodo },
        // Placeholder aceptable para venta de mostrador sin cliente identificado.
        // TODO: usar el email real del cliente cuando el POS lo resuelva.
        customerEmail: 'ventas@negocio.local',
      });

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

    return { referencia, wompiTransactionId };
  }

  /**
   * Procesa un evento de webhook de Wompi. Es un endpoint público sin JWT
   * (Task 7 lo expone como @Public()) — la firma SHA256 es la ÚNICA defensa
   * contra un payload forjado, así que se verifica ANTES de tocar cualquier
   * dato y CUALQUIER fallo (firma inválida, payload malformado, transacción
   * desconocida) descarta el evento en silencio: sin lanzar excepción, sin
   * tocar la DB, sin darle a un posible atacante ninguna señal de por qué
   * falló.
   *
   * negocioId NO viene de this.getNegocioId() (no hay contexto CLS en un
   * webhook sin JWT) — se resuelve de la TransaccionPago encontrada por
   * `referencia`, que es la excepción documentada al patrón TenantBaseService
   * para este único método.
   */
  async procesarWebhook(payload: WompiWebhookPayload): Promise<void> {
    if (payload?.event !== 'transaction.updated') return;

    const referencia = payload.data?.transaction?.reference as
      | string
      | undefined;
    if (!referencia) return;

    const transaccion = await this.transaccionRepo.findOne({
      where: { referencia },
    });
    if (!transaccion) return; // evento de una transacción que no es nuestra o ya no existe

    const config = await this.configRepo.findOne({
      where: { negocioId: transaccion.negocioId },
    });
    if (!config?.llaveSecretaEventosCifrada) return;

    const secreto = desencriptar(config.llaveSecretaEventosCifrada);

    // Concatena, EN ORDEN, los valores que Wompi declara haber firmado
    // (payload.signature.properties, ej. "transaction.id") + el timestamp +
    // el secreto del negocio, y compara el SHA256 contra el checksum
    // recibido. Acceso con optional chaining a propósito: un payload
    // malformado (entidad/campo inexistente) produce `undefined` en vez de
    // lanzar una excepción — el checksum resultante simplemente no calza,
    // así el evento se descarta por el mismo camino que una firma inválida,
    // sin distinguir el motivo hacia afuera.
    let checksumEsperado: string;
    try {
      const valores = (payload.signature?.properties ?? []).map((prop) => {
        const [entidad, campo] = prop.split('.');
        return payload.data?.[entidad]?.[campo];
      });
      const cadena = valores.join('') + payload.timestamp + secreto;
      checksumEsperado = createHash('sha256').update(cadena).digest('hex');
    } catch {
      return; // payload estructuralmente inválido — descartar en silencio, mismo tratamiento que una firma inválida
    }

    if (checksumEsperado !== payload.signature?.checksum) {
      return; // firma inválida — descartar en silencio, no darle información a un posible atacante
    }

    const status = payload.data.transaction.status as string;
    transaccion.estado =
      status === 'APPROVED'
        ? 'APROBADA'
        : status === 'DECLINED'
          ? 'DECLINADA'
          : 'ERROR';
    transaccion.wompiTransactionId = payload.data.transaction.id as string;
    transaccion.confirmedAt = new Date();
    await this.transaccionRepo.save(transaccion);

    if (transaccion.estado === 'APROBADA') {
      this.realtimeGateway.emitToNegocio(
        transaccion.negocioId,
        'pago-wompi:confirmado',
        { referencia },
      );
    }
  }
}
