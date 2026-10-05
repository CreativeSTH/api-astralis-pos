import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { QueryFailedError, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { Sucursal } from '../sucursales/entities/sucursal.entity';
import { Empleado } from './entities/empleado.entity';
import { CreateEmpleadoDto, UpdateEmpleadoDto } from './dto/create-empleado.dto';

@Injectable()
export class EmpleadosService extends TenantBaseService<Empleado> {
  constructor(
    @InjectRepository(Empleado) repository: Repository<Empleado>,
    @InjectRepository(Usuario) private readonly usuarioRepo: Repository<Usuario>,
    @InjectRepository(Sucursal) private readonly sucursalRepo: Repository<Sucursal>,
    cls: ClsService,
  ) {
    super(repository, cls, 'Empleado');
  }

  findAll() {
    return this.findAllForTenant({ activo: true });
  }

  findOne(id: string) {
    return this.findOneForTenant(id);
  }

  async create(dto: CreateEmpleadoDto): Promise<Empleado> {
    const { pin, ...datos } = dto;
    await this.validarReferencias(datos);
    await this.validarDocumentoUnico(datos.numeroDocumento);
    await this.validarPinUnico(pin);
    const pinMarcacionHash = await bcrypt.hash(pin, 10);
    const empleado = await this.traducirUnico(() => this.createForTenant({ ...datos, pinMarcacionHash }));
    return this.sinPin(empleado);
  }

  async update(id: string, dto: UpdateEmpleadoDto): Promise<Empleado> {
    await this.validarReferencias(dto);
    if (dto.numeroDocumento) await this.validarDocumentoUnico(dto.numeroDocumento, id);
    return this.sinPin(await this.traducirUnico(() => this.updateForTenant(id, dto)));
  }

  async cambiarPin(id: string, pin: string): Promise<void> {
    const empleado = await this.findOneForTenant(id);
    await this.validarPinUnico(pin, id);
    empleado.pinMarcacionHash = await bcrypt.hash(pin, 10);
    await this.repository.save(empleado);
  }

  async remove(id: string): Promise<void> {
    await this.updateForTenant(id, { activo: false });
  }

  /** Empleado activo del negocio dueño del PIN (mismo mecanismo que AuthService.verificarPin). */
  async buscarPorPin(negocioId: string, pin: string): Promise<Empleado | null> {
    for (const e of await this.conPin(negocioId)) {
      if (await bcrypt.compare(pin, e.pinMarcacionHash)) return this.sinPin(e);
    }
    return null;
  }

  private conPin(negocioId: string) {
    return this.repository.find({
      where: { negocioId, activo: true },
      select: { id: true, nombre: true, negocioId: true, pinMarcacionHash: true, sucursalId: true },
    });
  }

  private async validarPinUnico(pin: string, exceptoId?: string): Promise<void> {
    for (const e of await this.conPin(this.getNegocioId())) {
      if (e.id !== exceptoId && (await bcrypt.compare(pin, e.pinMarcacionHash))) {
        throw new ConflictException('Ese PIN ya lo usa otro empleado');
      }
    }
  }

  private async validarDocumentoUnico(numeroDocumento: string, exceptoId?: string): Promise<void> {
    const existe = await this.repository.findOne({ where: { negocioId: this.getNegocioId(), numeroDocumento } });
    if (existe && existe.id !== exceptoId) throw new ConflictException('Ya hay un empleado con ese documento');
  }

  private async validarReferencias(dto: { sucursalId?: string | null; usuarioId?: string | null }): Promise<void> {
    const negocioId = this.getNegocioId();
    if (dto.sucursalId && !(await this.sucursalRepo.exists({ where: { id: dto.sucursalId, negocioId } }))) {
      throw new BadRequestException('La sucursal no existe en este negocio');
    }
    if (dto.usuarioId && !(await this.usuarioRepo.exists({ where: { id: dto.usuarioId, negocioId } }))) {
      throw new BadRequestException('El usuario no existe en este negocio');
    }
  }

  /** El índice único parcial `UQ_empleados_usuario` impide vincular un usuario a dos empleados. */
  private async traducirUnico<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn();
    } catch (error) {
      const e = error as { code?: string; constraint?: string; driverError?: { constraint?: string } };
      const constraint = e.constraint ?? e.driverError?.constraint;
      if (error instanceof QueryFailedError && e.code === '23505' && constraint === 'UQ_empleados_usuario') {
        throw new ConflictException('Ese usuario ya está vinculado a otro empleado');
      }
      throw error;
    }
  }

  private sinPin(e: Empleado): Empleado {
    const { pinMarcacionHash: _omit, ...resto } = e as Empleado & { pinMarcacionHash?: string };
    return resto as Empleado;
  }
}
