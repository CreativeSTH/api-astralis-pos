import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Auditable } from '../../auditoria/auditable.decorator';
import { ModuloPermiso } from '../../common/enums/modulo-permiso.enum';

@Auditable<Marca>({
  modulo: ModuloPermiso.MARCAS,
  nombre: 'la marca',
  etiqueta: (m) => m.nombre,
  campos: {
    nombre: { label: 'Nombre' },
    marcaPadreId: { label: 'Marca padre', formato: 'relacion', entidad: () => Marca },
    activo: { label: 'Activa', formato: 'booleano' },
  },
})
@Entity('marcas')
export class Marca extends BaseEntity {
  @Index()
  @Column({ name: 'negocio_id' })
  negocioId: string;

  @Column()
  nombre: string;

  /** Si tiene valor, esta marca es una sub-marca de otra (ej. "Royal Canin Veterinary" de "Royal Canin"). */
  @Column({ name: 'marca_padre_id', nullable: true })
  marcaPadreId?: string;

  @ManyToOne(() => Marca, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'marca_padre_id' })
  marcaPadre?: Marca;

  @Column({ default: true })
  activo: boolean;
}
