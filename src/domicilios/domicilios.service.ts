import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantBaseService } from '../common/services/tenant-base.service';
import { Domicilio } from './entities/domicilio.entity';
import { EstadoDomicilio } from '../common/enums/estado-domicilio.enum';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AccionAuditoria } from '../auditoria/enums/accion-auditoria.enum';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';

@Injectable()
export class DomiciliosService extends TenantBaseService<Domicilio> {
  constructor(
    @InjectRepository(Domicilio) repository: Repository<Domicilio>,
    cls: ClsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly auditoria: AuditoriaService,
  ) {
    super(repository, cls, 'Domicilio');
  }

  findAll(estado?: EstadoDomicilio, sucursalId?: string) {
    const where: FindOptionsWhere<Domicilio> = {};
    if (estado) where.estado = estado;
    if (sucursalId) where.sucursalId = sucursalId;
    return this.findAllForTenant(where);
  }

  async marcarEnCamino(
    id: string,
    domiciliarioNombre?: string,
  ): Promise<Domicilio> {
    const domicilio = await this.findOneForTenant(id);
    if (domicilio.estado !== EstadoDomicilio.NUEVO) {
      throw new BadRequestException(
        'Solo se puede marcar en camino un domicilio nuevo',
      );
    }
    const actualizado = await this.updateForTenant(id, {
      estado: EstadoDomicilio.EN_CAMINO,
      domiciliarioNombre,
      fechaEnCamino: new Date(),
    });
    this.emitir(actualizado);
    return actualizado;
  }

  async marcarEntregado(id: string): Promise<Domicilio> {
    const domicilio = await this.findOneForTenant(id);
    if (domicilio.estado !== EstadoDomicilio.EN_CAMINO) {
      throw new BadRequestException(
        'Solo se puede marcar entregado un domicilio en camino',
      );
    }
    const actualizado = await this.updateForTenant(id, {
      estado: EstadoDomicilio.ENTREGADO,
      fechaEntregado: new Date(),
    });
    this.emitir(actualizado);
    return actualizado;
  }

  async cancelar(id: string, motivo?: string): Promise<Domicilio> {
    const domicilio = await this.findOneForTenant(id);
    if (
      domicilio.estado === EstadoDomicilio.ENTREGADO ||
      domicilio.estado === EstadoDomicilio.CANCELADO
    ) {
      throw new BadRequestException('Este domicilio ya no se puede cancelar');
    }
    const actualizado = await this.updateForTenant(id, {
      estado: EstadoDomicilio.CANCELADO,
      motivoCancelacion: motivo,
      fechaCancelado: new Date(),
    });
    await this.auditoria.registrarAccion({
      modulo: ModuloPermiso.DOMICILIOS,
      entidad: 'Domicilio',
      entidadId: actualizado.id,
      etiqueta: `Domicilio ${actualizado.id.slice(0, 8)}`,
      accion: AccionAuditoria.CANCELAR,
      descripcion: `Canceló el domicilio${motivo ? ` — ${motivo}` : ''}`,
    });
    this.emitir(actualizado);
    return actualizado;
  }

  private emitir(domicilio: Domicilio): void {
    this.realtimeGateway.emitToNegocio(
      domicilio.negocioId,
      'domicilios:cambio',
      domicilio,
    );
  }
}
