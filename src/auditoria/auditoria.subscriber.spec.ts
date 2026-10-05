import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Auditable } from './auditable.decorator';
import { AuditoriaSubscriber } from './auditoria.subscriber';
import type { DatosRegistro } from './auditoria.service';
import { AccionAuditoria } from './enums/accion-auditoria.enum';
import { ModuloPermiso } from '../common/enums/modulo-permiso.enum';

@Auditable<Cosa>({
  modulo: ModuloPermiso.PRODUCTOS,
  nombre: 'el producto',
  etiqueta: (c) => c.nombre,
  campos: {
    nombre: { label: 'Nombre' },
    precio: { label: 'Precio', formato: 'moneda' },
    activo: { label: 'Activo', formato: 'booleano' },
  },
})
@Entity('cosas_test')
class Cosa {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() negocioId: string;
  @Column() nombre: string;
  @Column() precio: number;
  @Column() activo: boolean;
}

class NoAuditable {}

describe('AuditoriaSubscriber', () => {
  const escribir = jest.fn();
  const manager = { find: jest.fn().mockResolvedValue([]) };
  const dataSource = { subscribers: [] as unknown[] };
  const subscriber = new AuditoriaSubscriber(
    dataSource as any,
    { escribir } as any,
  );
  const base = {
    id: 'c1',
    negocioId: 'n1',
    nombre: 'Coca',
    precio: '10000.00',
    activo: true,
  };

  beforeEach(() => escribir.mockReset());

  it('se registra en el DataSource', () => {
    expect(dataSource.subscribers).toContain(subscriber);
  });

  it('afterUpdate escribe EDITAR con los cambios legibles', async () => {
    await subscriber.afterUpdate({
      metadata: { target: Cosa },
      manager,
      databaseEntity: base,
      entity: { ...base, precio: 12000 },
    } as any);
    expect(escribir).toHaveBeenCalledWith(manager, {
      negocioId: 'n1',
      modulo: ModuloPermiso.PRODUCTOS,
      entidad: 'Cosa',
      entidadId: 'c1',
      entidadEtiqueta: 'Coca',
      accion: AccionAuditoria.EDITAR,
      descripcion: 'Editó el producto "Coca"',
      cambios: [
        {
          campo: 'precio',
          etiqueta: 'Precio',
          antes: '$10.000',
          despues: '$12.000',
        },
      ],
    });
  });

  it('afterUpdate sin cambios en la lista blanca no escribe', async () => {
    await subscriber.afterUpdate({
      metadata: { target: Cosa },
      manager,
      databaseEntity: base,
      entity: { ...base },
    } as any);
    expect(escribir).not.toHaveBeenCalled();
  });

  it('afterUpdate solo de activo escribe DESACTIVAR', async () => {
    await subscriber.afterUpdate({
      metadata: { target: Cosa },
      manager,
      databaseEntity: base,
      entity: { ...base, activo: false },
    } as any);
    expect((escribir.mock.calls[0] as [unknown, DatosRegistro])[1].accion).toBe(
      AccionAuditoria.DESACTIVAR,
    );
  });

  it('afterInsert escribe CREAR', async () => {
    await subscriber.afterInsert({
      metadata: { target: Cosa },
      manager,
      entity: base,
    } as any);
    expect(
      (escribir.mock.calls[0] as [unknown, DatosRegistro])[1],
    ).toMatchObject({
      accion: AccionAuditoria.CREAR,
      descripcion: 'Creó el producto "Coca"',
    });
  });

  it('ignora entidades sin @Auditable y entidades sin negocio', async () => {
    await subscriber.afterInsert({
      metadata: { target: NoAuditable },
      manager,
      entity: base,
    } as any);
    await subscriber.afterInsert({
      metadata: { target: Cosa },
      manager,
      entity: { ...base, negocioId: null },
    } as any);
    expect(escribir).not.toHaveBeenCalled();
  });

  it('afterRemove escribe ELIMINAR con el estado previo', async () => {
    await subscriber.afterRemove({
      metadata: { target: Cosa },
      manager,
      databaseEntity: base,
      entity: undefined,
      entityId: 'c1',
    } as any);
    expect(
      (escribir.mock.calls[0] as [unknown, DatosRegistro])[1],
    ).toMatchObject({
      accion: AccionAuditoria.ELIMINAR,
      entidadId: 'c1',
    });
  });
});
