import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Venta } from '../ventas/entities/venta.entity';
import { HabilitacionFacturacionElectronica } from '../facturacion-electronica/entities/habilitacion-facturacion-electronica.entity';
import { EstadoHabilitacion } from '../facturacion-electronica/entities/estado-habilitacion.enum';
import { SuscripcionesService } from '../suscripciones/suscripciones.service';

export interface EstadoOnboarding {
  sucursalConfigurada: boolean;
  facturacionDian: 'NO_APLICA' | 'PENDIENTE' | 'LISTO';
  primeraVentaRealizada: boolean;
}

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(Sucursal)
    private readonly sucursalRepository: Repository<Sucursal>,
    @InjectRepository(Venta)
    private readonly ventaRepository: Repository<Venta>,
    @InjectRepository(HabilitacionFacturacionElectronica)
    private readonly habilitacionRepository: Repository<HabilitacionFacturacionElectronica>,
    private readonly suscripcionesService: SuscripcionesService,
  ) {}

  async obtenerEstado(negocioId: string): Promise<EstadoOnboarding> {
    const [sucursalConfigurada, primeraVentaRealizada, incluyeDian] = await Promise.all([
      this.sucursalRepository.count({ where: { negocioId } }).then((n) => n > 0),
      this.ventaRepository.count({ where: { negocioId } }).then((n) => n > 0),
      this.suscripcionesService.tieneFeature(negocioId, 'facturacionDianHabilitada'),
    ]);

    let facturacionDian: EstadoOnboarding['facturacionDian'] = 'NO_APLICA';
    if (incluyeDian) {
      const habilitacion = await this.habilitacionRepository.findOne({ where: { negocioId } });
      facturacionDian = habilitacion?.estado === EstadoHabilitacion.HABILITADO ? 'LISTO' : 'PENDIENTE';
    }

    return { sucursalConfigurada, facturacionDian, primeraVentaRealizada };
  }
}
