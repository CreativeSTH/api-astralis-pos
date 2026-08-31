import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Suscripcion } from './entities/suscripcion.entity';
import { EstadoSuscripcion } from './entities/estado-suscripcion.enum';
import { TransaccionSuscripcion } from './entities/transaccion-suscripcion.entity';

const DIAS_PRUEBA = 20;

@Injectable()
export class SuscripcionesService {
  constructor(
    @InjectRepository(Suscripcion)
    private readonly suscripcionesRepository: Repository<Suscripcion>,
    @InjectRepository(TransaccionSuscripcion)
    private readonly transaccionesRepository: Repository<TransaccionSuscripcion>,
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
}
