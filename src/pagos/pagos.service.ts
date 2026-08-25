import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { ConfiguracionPagoWompi } from './entities/configuracion-pago-wompi.entity';
import { encriptar } from '../common/utils/cifrado';

@Injectable()
export class PagosService extends TenantBaseService<ConfiguracionPagoWompi> {
  constructor(
    @InjectRepository(ConfiguracionPagoWompi)
    private readonly configRepo: Repository<ConfiguracionPagoWompi>,
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
}
