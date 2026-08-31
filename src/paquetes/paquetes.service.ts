import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
