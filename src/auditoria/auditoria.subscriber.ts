import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  EntitySubscriberInterface,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { opcionesAuditable } from './auditable.decorator';
import {
  CampoCambiado,
  camposCambiados,
  camposIniciales,
  clasificarAccion,
} from './auditoria-diff';
import {
  armarRegistro,
  FilaAuditable,
  resolverEtiquetas,
} from './auditoria-registro';
import { AuditoriaService } from './auditoria.service';
import { OpcionesAuditable } from './auditoria.types';
import { AccionAuditoria } from './enums/accion-auditoria.enum';

type Fila = FilaAuditable;

/**
 * Auditoría automática de las entidades `@Auditable` (spec §3). Escribe con `event.manager`: misma
 * transacción que el cambio. Solo ve lo que pasa por save()/remove(); los `update()` directos
 * se cubren con `AuditoriaService.registrarAccion`.
 *
 * Las relaciones muchos-a-muchos no se comparan al editar: si solo cambia la tabla de unión,
 * TypeORM no emite `afterUpdate`. Los services que las editan llaman a
 * `AuditoriaService.registrarRelacionesMultiples` con el estado previo.
 */
@Injectable()
export class AuditoriaSubscriber implements EntitySubscriberInterface {
  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {
    dataSource.subscribers.push(this);
  }

  async afterInsert(event: InsertEvent<Fila>): Promise<void> {
    const opciones = opcionesAuditable(event.metadata.target);
    if (!opciones || !event.entity) return;
    const campos = camposIniciales(opciones, event.entity);
    await this.escribir(
      event.manager,
      opciones,
      event.metadata.target,
      event.entity,
      AccionAuditoria.CREAR,
      campos,
      [],
    );
  }

  async afterUpdate(event: UpdateEvent<Fila>): Promise<void> {
    const opciones = opcionesAuditable(event.metadata.target);
    if (!opciones || !event.entity || !event.databaseEntity) return;
    const antes = event.databaseEntity;
    const despues = event.entity as Fila;
    const { campos, secretos } = camposCambiados(
      opciones,
      antes,
      despues,
      'columnas',
    );
    if (campos.length === 0 && secretos.length === 0) return;
    const accion = campos.length
      ? clasificarAccion(campos)
      : AccionAuditoria.EDITAR;
    await this.escribir(
      event.manager,
      opciones,
      event.metadata.target,
      { ...antes, ...despues },
      accion,
      campos,
      secretos,
    );
  }

  async afterRemove(event: RemoveEvent<Fila>): Promise<void> {
    const opciones = opcionesAuditable(event.metadata.target);
    const previa = (event.databaseEntity ?? event.entity) as Fila | undefined;
    if (!opciones || !previa) return;
    const fila: Fila = {
      ...previa,
      id: previa.id ?? (event.entityId as string | undefined),
    };
    await this.escribir(
      event.manager,
      opciones,
      event.metadata.target,
      fila,
      AccionAuditoria.ELIMINAR,
      camposIniciales(opciones, fila),
      [],
    );
  }

  private async escribir(
    manager: EntityManager,
    opciones: OpcionesAuditable,
    target: unknown,
    fila: Fila,
    accion: AccionAuditoria,
    campos: CampoCambiado[],
    secretos: string[],
  ): Promise<void> {
    if (!(opciones.negocioIdDe ? opciones.negocioIdDe(fila) : fila.negocioId))
      return; // tier SISTEMA
    const etiquetas = await resolverEtiquetas(manager, campos);
    const datos = armarRegistro(
      opciones,
      target,
      fila,
      accion,
      campos,
      secretos,
      etiquetas,
    );
    if (datos) await this.auditoria.escribir(manager, datos);
  }
}
