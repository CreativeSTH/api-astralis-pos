import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { ConfiguracionPagoWompi } from './entities/configuracion-pago-wompi.entity';
import {
  MetodoPagoWompi,
  TransaccionPago,
} from './entities/transaccion-pago.entity';
import { WompiClientService } from './wompi-client.service';
import { encriptar, desencriptar } from '../common/utils/cifrado';

@Injectable()
export class PagosService extends TenantBaseService<ConfiguracionPagoWompi> {
  constructor(
    @InjectRepository(ConfiguracionPagoWompi)
    private readonly configRepo: Repository<ConfiguracionPagoWompi>,
    @InjectRepository(TransaccionPago)
    private readonly transaccionRepo: Repository<TransaccionPago>,
    private readonly wompiClient: WompiClientService,
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
}
