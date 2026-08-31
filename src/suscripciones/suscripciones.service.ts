import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { Suscripcion } from './entities/suscripcion.entity';
import { EstadoSuscripcion } from './entities/estado-suscripcion.enum';
import { TransaccionSuscripcion, MetodoPagoSuscripcion } from './entities/transaccion-suscripcion.entity';
import { WompiClientService } from '../pagos/wompi-client.service';
import { PaquetesService } from '../paquetes/paquetes.service';
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
  async estaBloqueado(negocioId: string): Promise<boolean> {
    const suscripcion = await this.suscripcionesRepository.findOne({ where: { negocioId } });
    if (!suscripcion) return true;
    return suscripcion.estado === EstadoSuscripcion.VENCIDA;
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

    const { wompiTransactionId, status, extra } = await this.wompiClient.crearTransaccion({
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

    const secreto = process.env.WOMPI_PLATAFORMA_LLAVE_SECRETA_EVENTOS!;
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
      }
    }
  }

  /** ACTIVA con fechaFin = ahora + 30 días — comparte lógica entre el camino síncrono (aprobación inmediata), el webhook, y el polling de respaldo. */
  private async activarTrasPago(negocioId: string, paqueteId: string): Promise<void> {
    const suscripcion = await this.suscripcionesRepository.findOne({ where: { negocioId } });
    if (!suscripcion) throw new BadRequestException(`Negocio ${negocioId} sin suscripción — no se puede activar`);

    const fechaFin = new Date();
    fechaFin.setDate(fechaFin.getDate() + 30);

    suscripcion.paqueteId = paqueteId;
    suscripcion.estado = EstadoSuscripcion.ACTIVA;
    suscripcion.fechaFin = fechaFin;
    await this.suscripcionesRepository.save(suscripcion);
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
