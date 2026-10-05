import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
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
    sucursalId: { label: 'Sucursal', formato: 'relacion', entidad: () => Sucursal },
    activo: { label: 'Activa', formato: 'booleano' },
  },
})
@Entity('bodegas')
export class Bodega extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column({ name: 'sucursal_id' })
  sucursalId: string;

  @ManyToOne(() => Sucursal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sucursal_id' })
  sucursal: Sucursal;

  @Column()
  nombre: string;

  @Column({ default: true })
  activo: boolean;
}
