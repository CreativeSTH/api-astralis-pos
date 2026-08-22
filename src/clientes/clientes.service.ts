import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Cliente } from './entities/cliente.entity';
import { NotaCliente } from './entities/nota-cliente.entity';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { CreateNotaClienteDto } from './dto/create-nota-cliente.dto';
import { BuscarClientesDto } from './dto/buscar-clientes.dto';

@Injectable()
export class ClientesService extends TenantBaseService<Cliente> {
  constructor(
    @InjectRepository(Cliente) repository: Repository<Cliente>,
    @InjectRepository(NotaCliente)
    private readonly notasRepository: Repository<NotaCliente>,
    cls: ClsService,
  ) {
    super(repository, cls, 'Cliente');
  }

  findAll() {
    return this.findAllForTenant({ activo: true });
  }

  findOne(id: string) {
    return this.findOneForTenant(id);
  }

  async buscar(filtros: BuscarClientesDto) {
    const negocioId = this.getNegocioId();
    const query = this.repository
      .createQueryBuilder('cliente')
      .where('cliente.negocio_id = :negocioId', { negocioId })
      .andWhere('cliente.activo = true');

    if (filtros.nombre) {
      query.andWhere('cliente.nombre ILIKE :nombre', {
        nombre: `%${filtros.nombre}%`,
      });
    }
    if (filtros.telefono) {
      query.andWhere('cliente.telefono ILIKE :telefono', {
        telefono: `%${filtros.telefono}%`,
      });
    }
    if (filtros.bloqueadoPorMora !== undefined) {
      query.andWhere('cliente.bloqueado_por_mora = :bloqueado', {
        bloqueado: filtros.bloqueadoPorMora,
      });
    }

    const page = filtros.page ?? 1;
    const limit = filtros.limit ?? 20;
    const [data, total] = await query
      .orderBy('cliente.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async estadisticas() {
    const clientes = await this.findAllForTenant();
    const conDeuda = clientes.filter((c) => Number(c.deudaActual) > 0);
    const bloqueados = clientes.filter((c) => c.bloqueadoPorMora);
    const deudaTotal = clientes.reduce(
      (sum, c) => sum + Number(c.deudaActual),
      0,
    );
    const promedioScore = clientes.length
      ? Math.round(
          clientes.reduce((sum, c) => sum + c.score, 0) / clientes.length,
        )
      : 0;

    return {
      total: clientes.length,
      activos: clientes.filter((c) => c.activo).length,
      bloqueados: bloqueados.length,
      conDeuda: conDeuda.length,
      deudaTotal,
      promedioScore,
      distribucionScore: {
        excelente: clientes.filter((c) => c.score >= 80).length,
        bueno: clientes.filter((c) => c.score >= 60 && c.score < 80).length,
        regular: clientes.filter((c) => c.score >= 40 && c.score < 60).length,
        malo: clientes.filter((c) => c.score < 40).length,
      },
    };
  }

  async verificarCredito(
    id: string,
    monto: number,
  ): Promise<{
    aprobado: boolean;
    limiteCredito: number;
    deudaActual: number;
    creditoDisponible: number;
    montoSolicitado: number;
    creditoRestante?: number;
    mensaje?: string;
  }> {
    const cliente = await this.findOneForTenant(id);
    const creditoDisponible =
      Number(cliente.limiteCredito) - Number(cliente.deudaActual);
    const aprobado = !cliente.bloqueadoPorMora && monto <= creditoDisponible;

    return {
      aprobado,
      limiteCredito: Number(cliente.limiteCredito),
      deudaActual: Number(cliente.deudaActual),
      creditoDisponible,
      montoSolicitado: monto,
      creditoRestante: aprobado ? creditoDisponible - monto : undefined,
      mensaje: aprobado
        ? undefined
        : cliente.bloqueadoPorMora
          ? 'Cliente bloqueado por mora'
          : `Crédito insuficiente. Disponible: ${creditoDisponible}, Solicitado: ${monto}`,
    };
  }

  async create(dto: CreateClienteDto): Promise<Cliente> {
    const existente = await this.repository.findOne({
      where: { telefono: dto.telefono, negocioId: this.getNegocioId() },
    });
    if (existente) {
      throw new ConflictException(
        `Ya existe un cliente con el teléfono ${dto.telefono}`,
      );
    }
    return this.createForTenant(dto);
  }

  update(id: string, dto: UpdateClienteDto) {
    return this.updateForTenant(id, dto);
  }

  async remove(id: string) {
    await this.updateForTenant(id, { activo: false });
  }

  async bloquear(id: string, motivo: string): Promise<Cliente> {
    return this.updateForTenant(id, {
      bloqueadoPorMora: true,
      fechaBloqueo: new Date(),
      motivoBloqueo: motivo,
    });
  }

  async desbloquear(id: string): Promise<Cliente> {
    return this.updateForTenant(id, {
      bloqueadoPorMora: false,
      fechaBloqueo: undefined,
      motivoBloqueo: undefined,
    });
  }

  async agregarNota(
    clienteId: string,
    dto: CreateNotaClienteDto,
  ): Promise<NotaCliente> {
    await this.findOneForTenant(clienteId);
    const nota = this.notasRepository.create({
      clienteId,
      tipo: dto.tipo,
      contenido: dto.contenido,
      creadaPor: this.cls.get<string>('usuarioId'),
    });
    return this.notasRepository.save(nota);
  }

  async listarNotas(clienteId: string) {
    await this.findOneForTenant(clienteId);
    const notas = await this.notasRepository.find({
      where: { clienteId },
      order: { fecha: 'DESC' },
    });
    return { notas, total: notas.length };
  }

  /**
   * Único punto de escritura de la deuda del cliente — lo usa VentasService
   * al crear/cancelar ventas a crédito y al registrar abonos, para que la
   * validación de cupo y el saldo nunca se desincronicen.
   */
  async ajustarDeuda(clienteId: string, delta: number): Promise<void> {
    const cliente = await this.repository.findOne({
      where: { id: clienteId, negocioId: this.getNegocioId() },
    });
    if (!cliente) return;
    const nuevaDeuda = Number(cliente.deudaActual) + delta;
    if (nuevaDeuda < 0) {
      throw new BadRequestException(
        'La deuda del cliente no puede quedar negativa',
      );
    }
    cliente.deudaActual = nuevaDeuda;
    await this.repository.save(cliente);
  }
}
