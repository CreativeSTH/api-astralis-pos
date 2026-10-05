import { Column, Entity, Index, JoinTable, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Sucursal } from '../../sucursales/entities/sucursal.entity';
import { Auditable } from '../../auditoria/auditable.decorator';
import { ModuloPermiso } from '../../common/enums/modulo-permiso.enum';

@Auditable<Bodega>({
  modulo: ModuloPermiso.BODEGAS,
  nombre: 'la bodega',
  etiqueta: (b) => b.nombre,
  campos: {
    nombre: { label: 'Nombre' },
    sucursales: { label: 'Sucursales', formato: 'relacionMultiple', entidad: () => Sucursal },
    activo: { label: 'Activa', formato: 'booleano' },
  },
})
@Entity('bodegas')
export class Bodega extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  /**
   * Sucursales que venden de esta bodega (spec 2026-10-04). Vacío = bodega central (CEDI): guarda
   * stock y despacha traslados, pero ningún punto de venta vende de ella. Dos o más = compartida.
   */
  @ManyToMany(() => Sucursal)
  @JoinTable({
    name: 'sucursal_bodegas',
    joinColumn: { name: 'bodega_id' },
    inverseJoinColumn: { name: 'sucursal_id' },
  })
  sucursales: Sucursal[];

  @Column()
  nombre: string;

  @Column({ default: true })
  activo: boolean;
}
