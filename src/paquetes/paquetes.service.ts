import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Paquete } from './entities/paquete.entity';
import { CreatePaqueteDto } from './dto/create-paquete.dto';
import { UpdatePaqueteDto } from './dto/update-paquete.dto';

@Injectable()
export class PaquetesService {
  constructor(
    @InjectRepository(Paquete)
    private readonly paquetesRepository: Repository<Paquete>,
  ) {}

  findAll(): Promise<Paquete[]> {
    return this.paquetesRepository.find({
      where: { activo: true },
      order: { precioMensual: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Paquete> {
    const paquete = await this.paquetesRepository.findOne({ where: { id } });
    if (!paquete) {
      throw new NotFoundException(`Paquete con ID ${id} no encontrado`);
    }
    return paquete;
  }

  create(dto: CreatePaqueteDto): Promise<Paquete> {
    // esPaqueteFree nunca es asignable desde el CRUD público — solo
    // asegurarPaqueteFreePorDefecto() lo pone en true, para que nunca haya
    // dos paquetes marcados como el fallback.
    const paquete = this.paquetesRepository.create({ ...dto, esPaqueteFree: false });
    return this.paquetesRepository.save(paquete);
  }

  async update(id: string, dto: UpdatePaqueteDto): Promise<Paquete> {
    const paquete = await this.findOne(id);
    // Exclusivo — mismo patrón que MetodoPago.esEfectivo: desmarcar antes de guardar el nuevo,
    // así nunca queda más de un paquete marcado (el índice único parcial es la garantía final).
    if (dto.esPaqueteTrialCompleto) {
      await this.paquetesRepository.update({ esPaqueteTrialCompleto: true }, { esPaqueteTrialCompleto: false });
    }
    Object.assign(paquete, dto);
    return this.paquetesRepository.save(paquete);
  }

  async remove(id: string): Promise<void> {
    const paquete = await this.findOne(id);
    if (paquete.esPaqueteFree) {
      throw new BadRequestException(
        'El paquete FREE no se puede desactivar — es el paquete de respaldo de todo negocio sin otro asignado',
      );
    }
    paquete.activo = false;
    await this.paquetesRepository.save(paquete);
  }

  /**
   * Paquete que recibe automáticamente todo registro público durante el trial de 20 días
   * (ver NegociosService.registroPublico) — nadie elige plan a ciegas al registrarse.
   * Falla explícito si ningún paquete está marcado: no debería pasar nunca tras la migración
   * que lo siembra, pero es preferible un 500 claro a activar una PRUEBA con un paqueteId roto.
   */
  async obtenerPaqueteTrialCompleto(): Promise<Paquete> {
    const paquete = await this.paquetesRepository.findOne({ where: { esPaqueteTrialCompleto: true } });
    if (!paquete) {
      throw new InternalServerErrorException('Ningún paquete está marcado como el del trial completo — revisar /paquetes');
    }
    return paquete;
  }

  /** Idempotente — sembrado global (una sola fila en toda la plataforma, no por negocio). */
  async asegurarPaqueteFreePorDefecto(): Promise<Paquete> {
    const existente = await this.paquetesRepository.findOne({ where: { esPaqueteFree: true } });
    if (existente) return existente;

    const free = this.paquetesRepository.create({
      nombre: 'Free',
      descripcion: 'Paquete de respaldo sin costo — sin acceso a features premium',
      precioMensual: 0,
      facturacionDianHabilitada: false,
      documentosDianPorMes: 0,
      tiendaOnlineHabilitada: false,
      maxSucursales: 0,
      maxUsuarios: 0,
      esPaqueteFree: true,
      activo: true,
    });
    return this.paquetesRepository.save(free);
  }
}
