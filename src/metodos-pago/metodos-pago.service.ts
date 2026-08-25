import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { MetodoPago } from './entities/metodo-pago.entity';
import { CreateMetodoPagoDto } from './dto/create-metodo-pago.dto';
import { UpdateMetodoPagoDto } from './dto/update-metodo-pago.dto';

/** Sembrados en un negocio nuevo — mismos 6 que antes vivían como enum fijo. Efectivo queda marcado como tal. */
const METODOS_POR_DEFECTO: { nombre: string; esEfectivo: boolean }[] = [
  { nombre: 'Efectivo', esEfectivo: true },
  { nombre: 'Tarjeta', esEfectivo: false },
  { nombre: 'Transferencia', esEfectivo: false },
  { nombre: 'Nequi', esEfectivo: false },
  { nombre: 'Daviplata', esEfectivo: false },
  { nombre: 'Otro', esEfectivo: false },
];

@Injectable()
export class MetodosPagoService extends TenantBaseService<MetodoPago> {
  constructor(
    @InjectRepository(MetodoPago) repository: Repository<MetodoPago>,
    cls: ClsService,
  ) {
    super(repository, cls, 'Método de pago');
  }

  findAll() {
    return this.findAllForTenant({ activo: true });
  }

  findOne(id: string) {
    return this.findOneForTenant(id);
  }

  async create(dto: CreateMetodoPagoDto) {
    await this.validarNombreUnico(dto.nombre);
    if (dto.esEfectivo) {
      await this.desmarcarEfectivo();
    }
    return this.createForTenant(dto);
  }

  async update(id: string, dto: UpdateMetodoPagoDto) {
    if (dto.nombre) {
      await this.validarNombreUnico(dto.nombre, id);
    }
    if (dto.esEfectivo) {
      await this.desmarcarEfectivo(id);
    }
    return this.updateForTenant(id, dto);
  }

  async remove(id: string) {
    await this.updateForTenant(id, { activo: false });
  }

  /** Crea (si el negocio no tiene ninguno) los métodos de pago por defecto. Idempotente. */
  async asegurarMetodosPorDefecto(negocioId: string): Promise<void> {
    const existentes = await this.repository.count({ where: { negocioId } });
    if (existentes > 0) return;

    await this.repository.save(
      METODOS_POR_DEFECTO.map((m) =>
        this.repository.create({ ...m, negocioId }),
      ),
    );
  }

  /**
   * Crea un único método de pago puntual si todavía no existe (activo o no) para
   * este negocio — a diferencia de `asegurarMetodosPorDefecto`, no se salta si el
   * negocio ya tiene otros métodos. Usado por `PagosService.activar()`: las ventas
   * pagadas con Wompi se registran con `VentaPago.metodoPago = 'Wompi - QR'`/`'Wompi -
   * NEQUI'` (string libre, ver CLAUDE.md de este repo), y `VentasService` exige que
   * ese string exista en el catálogo activo del negocio — sin este paso, la venta se
   * rechazaría justo después de que Wompi ya le cobró al cliente.
   */
  async asegurarMetodo(nombre: string): Promise<void> {
    const negocioId = this.getNegocioId();
    const existente = await this.repository.findOne({
      where: { negocioId, nombre },
    });
    if (existente) {
      if (!existente.activo) {
        await this.repository.save({ ...existente, activo: true });
      }
      return;
    }
    await this.repository.save(
      this.repository.create({
        nombre,
        esEfectivo: false,
        activo: true,
        negocioId,
      }),
    );
  }

  private async validarNombreUnico(
    nombre: string,
    excluirId?: string,
  ): Promise<void> {
    const activos = await this.findAllForTenant({ activo: true });
    const duplicado = activos.some(
      (m) =>
        m.id !== excluirId &&
        m.nombre.trim().toLowerCase() === nombre.trim().toLowerCase(),
    );
    if (duplicado) {
      throw new BadRequestException(
        `Ya existe un método de pago activo llamado "${nombre}"`,
      );
    }
  }

  /** Solo un método puede tener esEfectivo:true a la vez — desmarca cualquier otro antes de guardar el nuevo. */
  private async desmarcarEfectivo(excluirId?: string): Promise<void> {
    const activos = await this.findAllForTenant({
      activo: true,
      esEfectivo: true,
    });
    const otros = activos.filter((m) => m.id !== excluirId);
    if (otros.length === 0) return;
    await this.repository.save(otros.map((m) => ({ ...m, esEfectivo: false })));
  }
}
